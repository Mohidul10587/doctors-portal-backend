const express = require("express");
const http = require("http");
const { MongoClient, ServerApiVersion } = require("mongodb");
const jwt = require("jsonwebtoken");
const cors = require("cors");
var nodemailer = require("nodemailer");
const sgTransport = require("nodemailer-sendgrid-transport");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ysiejik.mongodb.net/?retryWrites=true&w=majority`;

const uri = `mongodb+srv://mohid10587:N53HL4QZnkgvbJH3@cluster.b528aeo.mongodb.net/?retryWrites=true&w=majority`;

// const uri = "mongodb://127.0.0.1:27017/doctor-portal";
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "UnAuthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(
    token,
    "3dda928b2799c9860b2d3a742a325501a1910afeb5a0484fe50742fc5e30859f95de8e852ba82efc071b3d849a484f1d9ba8545121817e1898a19e061d865053",
    function (err, decoded) {
      if (err) {
        return res.status(403).send({ massage: "forbidden" });
      }
      req.decoded = decoded;
      next();
    }
  );
}

// const options = {
//   auth: {
//     api_key: process.env.EMAIL_SENDER_KEY,
//   },
// };

// const clientEmail = nodemailer.createTransport(sgTransport(options));

// let transporter = nodemailer.createTransport({
//     host: 'smtp.sendgrid.net',
//     port: 587,
//     auth: {
//         user: "apikey",
//         pass: process.env.SENDGRID_API_KEY
//     }
// });

// transporter.sendMail({
//   from: "mohid10587@gmail.com", // verified sender email
//   to:'mohid10587@gmail.com', // recipient email
//   subject: `Your appointment for  is confirmed`, // Subject line
//   text: "Hello world!", // plain text body
//   html: `
//   <h3>Your appointment is confirmed</h3>

//   `, // html body
// }, function (error, info) {
//   if (error) {
//       console.log('Email send error', error);
//   } else {
//       console.log('Email sent: ' + info);
//   }
// });

// function emailSendHandler(booking) {
//   const { patient, patientName, treatment, date, slot } = booking;
//   const email = {
//     from: process.env.EMAIL_SENDER,
//     to: patient,
//     subject: `Your appointment ${treatment}`,
//     text: `Your appointment ${treatment}`,
//     html: ` <b>This is a email</b>`,
//   };

//   clientEmail.sendMail(email, function (error, info) {
//     if (error) {
//       console.log(error);
//     } else {
//       console.log("Email sent: ", info);
//     }
//   });
// }

app.get("/", async (req, res) => {
  res.send("This is first deployment in heroku");
});

async function run() {
  try {
    await client.connect();
    console.log("connected");
    const serviceCollection = client
      .db("doctors_portal")
      .collection("services");
    const bookingCollection = client.db("doctors_portal").collection("booking");
    const usersCollection = client.db("doctors_portal").collection("users");
    const doctorsCollection = client.db("doctors_portal").collection("doctors");

    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await usersCollection.findOne({
        email: requester,
      });

      if (requesterAccount.roll === "admin") {
        next();
      } else {
        res.status(403).send({ massage: "Forbidden" });
      }
    };

    app.get("/service", async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query).project({ name: 1 });
      const service = await cursor.toArray();
      res.send(service);
    });

    app.get("/user", verifyJWT, async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email: email });
      const isAdmin = user.roll === "admin";
      res.send({ admin: isAdmin });
    });
    app.put("/user/admin/:email", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const updateDoc = {
        $set: { roll: "admin" },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_VAR, {
        expiresIn: "1h",
      });
      res.send({ result, token });
    });

    app.get("/available", async (req, res) => {
      const date = req.query.date;
      const services = await serviceCollection.find().toArray();
      const query = { date: date };
      const bookings = await bookingCollection.find(query).toArray();
      services.forEach((service) => {
        const serviceBookings = bookings.filter(
          (book) => book.treatment === service.name
        );
        const bookedSlots = serviceBookings.map((book) => book.slot);
        const available = service.slots.filter(
          (slot) => !bookedSlots.includes(slot)
        );
        service.slots = available;
      });
      res.send(services);
    });

    app.get("/booking", verifyJWT, async (req, res) => {
      const patient = req.query.patient;
      const decodedEmail = req.decoded.email;
      if (decodedEmail === patient) {
        const query = { patient: patient };
        const bookings = await bookingCollection.find(query).toArray();
        res.send(bookings);
      } else {
        return res.status(403).send({ massage: "forbidden access" });
      }
    });

    app.post("/booking", async (req, res) => {
      const booking = req.body;
      const query = {
        treatment: booking.treatment,
        date: booking.date,
        patient: booking.patient,
      };
      const exists = await bookingCollection.findOne(query);
      if (exists) {
        return res.send({ success: false, booking: exists });
      }
      const result = await bookingCollection.insertOne(booking);

      // emailSendHandler(booking);
      console.log(booking.patient);
      return res.send({ success: true, result });
    });

    app.get("/doctor", verifyJWT, verifyAdmin, async (req, res) => {
      const doctors = await doctorsCollection.find().toArray();
      res.send(doctors);
    });

    app.post("/doctor", verifyJWT, verifyAdmin, async (req, res) => {
      const doctor = req.body;
      const result = await doctorsCollection.insertOne(doctor);
      res.send(result);
    });
    app.delete("/doctor/:email", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const result = await doctorsCollection.deleteOne(filter);
      res.send(result);
    });
  } finally {
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

// mohid10587

// N53HL4QZnkgvbJH3

const ser = [
  {
    name: "Teeth Orthodontics",
    slots: [
      "08.00 AM - 08.30 AM",
      "08.30 AM - 09.00 AM",
      "09.00 AM - 9.30 AM",
      "09.30 AM - 10.00 AM",
      "10.00 AM - 10.30 AM",
      "10.30 AM - 11.00 AM",
      "11.00 AM - 11.30 AM",
      "11.30 AM - 12.00 AM",
      "1.00 PM - 1.30 PM",
      "1.30 PM - 2.00 PM",
      "2.00 PM - 2.30 PM",
      "2.30 PM - 3.00 PM",
      "3.00 PM - 3.30 PM",
      "3.30 PM - 4.00 PM",
      "4.00 PM - 4.30 PM",
      "4.30 PM - 5.00 PM",
    ],
  },
  {
    name: "Cosmetic Dentistry",
    slots: [
      "08.00 AM - 08.30 AM",
      "08.30 AM - 09.00 AM",
      "09.00 AM - 9.30 AM",
      "09.30 AM - 10.00 AM",
      "10.00 AM - 10.30 AM",
      "10.30 AM - 11.00 AM",
      "11.00 AM - 11.30 AM",
      "11.30 AM - 12.00 AM",
      "1.00 PM - 1.30 PM",
      "1.30 PM - 2.00 PM",
      "2.00 PM - 2.30 PM",
      "2.30 PM - 3.00 PM",
      "3.00 PM - 3.30 PM",
      "3.30 PM - 4.00 PM",
      "4.00 PM - 4.30 PM",
      "4.30 PM - 5.00 PM",
    ],
  },
  {
    name: "Teeth Cleaning",
    slots: [
      "08.00 AM - 08.30 AM",
      "08.30 AM - 09.00 AM",
      "09.00 AM - 9.30 AM",
      "09.30 AM - 10.00 AM",
      "10.00 AM - 10.30 AM",
      "10.30 AM - 11.00 AM",
      "11.00 AM - 11.30 AM",
      "11.30 AM - 12.00 AM",
      "1.00 PM - 1.30 PM",
      "1.30 PM - 2.00 PM",
      "2.00 PM - 2.30 PM",
      "2.30 PM - 3.00 PM",
      "3.00 PM - 3.30 PM",
      "3.30 PM - 4.00 PM",
      "4.00 PM - 4.30 PM",
      "4.30 PM - 5.00 PM",
    ],
  },
  {
    name: "Cavity Protection",
    slots: [
      "08.00 AM - 08.30 AM",
      "08.30 AM - 09.00 AM",
      "09.00 AM - 9.30 AM",
      "09.30 AM - 10.00 AM",
      "10.00 AM - 10.30 AM",
      "10.30 AM - 11.00 AM",
      "11.00 AM - 11.30 AM",
      "11.30 AM - 12.00 AM",
      "1.00 PM - 1.30 PM",
      "1.30 PM - 2.00 PM",
      "2.00 PM - 2.30 PM",
      "2.30 PM - 3.00 PM",
      "3.00 PM - 3.30 PM",
      "3.30 PM - 4.00 PM",
      "4.00 PM - 4.30 PM",
      "4.30 PM - 5.00 PM",
    ],
  },
  {
    name: "Pediatric Dental",
    slots: [
      "08.00 AM - 08.30 AM",
      "08.30 AM - 09.00 AM",
      "09.00 AM - 9.30 AM",
      "09.30 AM - 10.00 AM",
      "10.00 AM - 10.30 AM",
      "10.30 AM - 11.00 AM",
      "11.00 AM - 11.30 AM",
      "11.30 AM - 12.00 AM",
      "1.00 PM - 1.30 PM",
      "1.30 PM - 2.00 PM",
      "2.00 PM - 2.30 PM",
      "2.30 PM - 3.00 PM",
      "3.00 PM - 3.30 PM",
      "3.30 PM - 4.00 PM",
      "4.00 PM - 4.30 PM",
      "4.30 PM - 5.00 PM",
    ],
  },
  {
    name: "Oral Surgery",
    slots: [
      "08.00 AM - 08.30 AM",
      "08.30 AM - 09.00 AM",
      "09.00 AM - 9.30 AM",
      "09.30 AM - 10.00 AM",
      "10.00 AM - 10.30 AM",
      "10.30 AM - 11.00 AM",
      "11.00 AM - 11.30 AM",
      "11.30 AM - 12.00 AM",
      "1.00 PM - 1.30 PM",
      "1.30 PM - 2.00 PM",
      "2.00 PM - 2.30 PM",
      "2.30 PM - 3.00 PM",
      "3.00 PM - 3.30 PM",
      "3.30 PM - 4.00 PM",
      "4.00 PM - 4.30 PM",
      "4.30 PM - 5.00 PM",
    ],
  },
];
