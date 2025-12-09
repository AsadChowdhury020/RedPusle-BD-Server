require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
const admin = require("firebase-admin");
const port = process.env.PORT || 3000;
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
    const donationCollection = db.collection("donationRequests");

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
    app.get("/users/email", verifyJWT, async (req, res) => {
      const email = req.query.email;

      if (!email) {
        return res.status(400).send({ message: "Email is required" });
      }

      // SECURE CHECK: user can only access their own data
      if (req.tokenEmail !== email) {
        return res.status(403).send({ message: "Forbidden!" });
      }

      const user = await usersCollection.findOne({ email });

      if (!user) {
        return res.status(404).send({ message: "User not found" });
      }

      res.send(user);
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

    // Create a new donation request
    app.post("/donation-requests", verifyJWT, async (req, res) => {
      const donationData = req.body;

      if (!donationData) {
        return res.status(400).send({ message: "Invalid data" });
      }


        donationData.createdAt = new Date();

        const result = await donationCollection.insertOne(donationData);

        res.send(result);
      }
    );

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
