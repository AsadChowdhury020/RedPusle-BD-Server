require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");
const port = process.env.PORT || 3000;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf-8"
);
const serviceAccount = JSON.parse(decoded);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
// middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
      "https://b12-m11-session.web.app",
    ],
    credentials: true,
    optionSuccessStatus: 200,
  })
);
app.use(express.json());

// jwt middlewares
const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(" ")[1];
  // console.log(token);
  if (!token) return res.status(401).send({ message: "Unauthorized Access!" });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.tokenEmail = decoded.email;
    // console.log(decoded);
    next();
  } catch (err) {
    console.log(err);
    return res.status(401).send({ message: "Unauthorized Access!", err });
  }
};

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    const db = client.db("RedPulseDB");
    const usersCollection = db.collection("users");
    const donationsCollection = db.collection("donationRequests");
    const blogsCollection = db.collection("blogs");
    const fundingCollection = db.collection("funding");

    /* ---------------------- USERS ---------------------- */

    // Store all the users in db
    app.post("/users", async (req, res) => {
      const user = req.body;

      const existingUser = await usersCollection.findOne({ email: user.email });
      if (existingUser) {
        return res.send({ message: "User already exists" });
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // Get all users from database
    app.get("/users", async (req, res) => {
      const query = {};
      const cursor = usersCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // Get a single user by email from database
    app.get("/users/email", verifyJWT, async (req, res) => {
      const email = req.query.email;

      if (!email) {
        return res.status(400).send({ message: "Email is required" });
      }

      if (req.tokenEmail !== email) {
        return res.status(403).send({ message: "Forbidden!" });
      }

      const user = await usersCollection.findOne({ email });

      if (!user) {
        return res.status(404).send({ message: "User not found" });
      }

      res.send(user);
    });

    app.get("/users/:email/role", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.tokenEmail !== email) {
        return res.status(403).send({ message: "Forbidden!" });
      }

      const user = await usersCollection.findOne({ email });

      if (!user) {
        return res.status(404).send({ message: "User not found" });
      }

      res.send({ role: user.role });
    });

    // Update user role or status
    app.patch("/users", async (req, res) => {
      const email = req.query.email;
      // const email = req.tokenEmail;
      const updateData = req.body;

      if (!email) {
        return res.status(400).send({ message: "Email is required" });
      }

      try {
        const filter = { email: email };
        const updateDoc = {
          $set: updateData,
        };

        const result = await usersCollection.updateOne(filter, updateDoc);

        if (result.modifiedCount === 0) {
          return res
            .status(404)
            .send({ message: "User not found or no changes made" });
        }

        res.send({ message: "User updated successfully" });
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Failed to update user", error });
      }
    });

    // GET api for search
    app.get("/search-donors", async (req, res) => {
      try {
        const { bloodGroup, district, upazila } = req.query;

        // Prevent blind search — require at least one filter
        if (!bloodGroup && !district && !upazila) {
          return res.status(400).send({
            message:
              "At least one search parameter (bloodGroup, district, or upazila) is required",
          });
        }

        // Build query conditionally
        const query = {
          role: "donor", // Only search among donors
        };

        if (bloodGroup) query.bloodGroup = bloodGroup;
        if (district) query.district = district;
        if (upazila) query.upazila = upazila;

        const result = await usersCollection.find(query).toArray();
        res.send(result);
      } catch (err) {
        console.error("Error searching donors:", err);
        res.status(500).send({ error: "Failed to search donors" });
      }
    });

    /* ---------------------- DONATION REQUESTS ---------------------- */
    // Create a new donation request
    app.post("/donation-requests", verifyJWT, async (req, res) => {
      const donationData = req.body;

      if (!donationData) {
        return res.status(400).send({ message: "Invalid data" });
      }

      donationData.createdAt = new Date();

      const result = await donationsCollection.insertOne(donationData);

      res.send(result);
    });

    // Get all user's donation requests
    app.get("/donation-requests", verifyJWT, async (req, res) => {
      const cursor = donationsCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // Get logged-in user's donation requests
    app.get("/donation-requests/email", verifyJWT, async (req, res) => {
      const email = req.query.email;

      if (!email) return res.status(400).send({ message: "Email is required" });

      // User can access only their own requests
      if (req.tokenEmail !== email)
        return res.status(403).send({ message: "Forbidden!" });

      const result = await donationsCollection
        .find({ requesterEmail: email })
        .sort({ createdAt: -1 })
        .toArray();

      res.send(result);
    });
    // Get donation requests by status (public)
    app.get("/donation-requests/status", async (req, res) => {
      const status = req.query.status;

      if (!status) {
        return res.status(400).send({ message: "Status is required" });
      }
      const result = await donationsCollection
        .find({ status })
        .sort({ createdAt: -1 })
        .toArray();

      res.send(result);
    });

    // Get a single donation request by ID
    app.get("/donation-requests/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;

      const request = await donationsCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!request) {
        return res.status(404).send({ message: "Donation request not found" });
      }

      res.send(request);
    });

    // Update donation request status or other fields
    app.patch("/donation-requests/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;

      const result = await donationsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      );

      if (result.modifiedCount === 0)
        return res.status(404).send({ message: "Update failed or no changes" });

      res.send({ message: "Donation request updated successfully" });
    });

    // Delete a donation request
    app.delete("/donation-requests/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;

      const result = await donationsCollection.deleteOne({
        _id: new ObjectId(id),
      });

      if (result.deletedCount === 0)
        return res.status(404).send({ message: "Delete failed" });

      res.send({ message: "Donation request deleted successfully" });
    });

    /* ---------------------- BLOGS ---------------------- */
    app.post("/blogs", async (req, res) => {
      const blog = req.body;
      const result = await blogsCollection.insertOne(blog);
      res.send(result);
    });

    // GET all blogs
    app.get("/blogs", async (req, res) => {
      try {
        const blogs = await blogsCollection
          .find()
          // .sort({ createdAt: -1 }) // newest first
          .toArray();

        res.send(blogs);
      } catch (err) {
        console.error("Error fetching blogs:", err);
        res.status(500).send({ error: "Failed to fetch blogs" });
      }
    });

    // GET id wise blog
    app.get("/blogs/:id", async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) };
      const result = await blogsCollection.findOne(query);

      res.send(result);
    });

    /* ---------------------- Funding ---------------------- */

    // Post funding
    app.post("/funding", verifyJWT, async (req, res) => {
      const fund = req.body;

      try {
        const result = await fundingCollection.insertOne(fund);
        res.send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Failed to store fund", error });
      }
    });

    // GET funding with pagination
    app.get("/funding", verifyJWT, async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 5;
      const skip = (page - 1) * limit;

      try {
        const total = await fundingCollection.countDocuments();
        const fundings = await fundingCollection
          .find()
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray();

        res.send({
          data: fundings,
          totalPages: Math.ceil(total / limit),
          currentPage: page,
        });
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch funding data" });
      }
    });

    app.post("/create-checkout-session", verifyJWT, async (req, res) => {
      const { amount, email } = req.body;

      try {
        const session = await stripe.checkout.sessions.create({
          customer_email: email, // Auto fill email in Stripe Checkout
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: { name: "RedPulseBD Funding Support" },
                unit_amount: amount * 100,
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          success_url:
            "http://localhost:5173/funding-success?session_id={CHECKOUT_SESSION_ID}",
          cancel_url: "http://localhost:5173/funding-cancel",

        });
        res.send({ url: session.url });
      } catch (error) {
        console.log(error);
        res.status(500).send({ error: error.message });
      }
    });

    app.get("/verify-checkout-session/:id", async (req, res) => {
      try {
        const session = await stripe.checkout.sessions.retrieve(req.params.id);

        if (session.payment_status !== "paid") {
          return res.status(400).send({ message: "Payment not completed" });
        }

        const data = {
          name: session.customer_details.name,
          email: session.customer_details.email,
          amount: session.amount_total / 100,
          transactionId: session.payment_intent,
          trackingId: session.id,
          createdAt: new Date(),
        };

        //  Prevent duplicate insertion
        const exists = await fundingCollection.findOne({
          transactionId: data.transactionId,
        });

        if (!exists) {
          await fundingCollection.insertOne(data);
        }

        res.send({
          ...data,
          date: data.createdAt.toISOString(),
        });
      } catch (error) {
        console.log("Verify Error:", error);
        res.status(500).send({ message: "Verification failed" });
      }
    });


    /* ---------------------- END ---------------------- */

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from Server..");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
