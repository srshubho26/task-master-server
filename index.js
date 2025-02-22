require('dotenv').config();
const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ynkon.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// Middleware
app.use(cors({
    origin: [
        "http://localhost:5173"
    ],
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

const verifyToken = (req, res, next) => {
    const token = req.cookies?.token;
    if (!token) {
        return res.status(401).send({ message: 'Unauthorized' })
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'Unauthorized' })
        }
        req.user = decoded;
        next();
    })
}

async function run() {
    try {
        const database = client.db("task_master");
        const usersCollection = database.collection("users");
        const tasksCollection = database.collection("tasks");

        // Add a new task
        app.post("/tasks", verifyToken, async (req, res) => {
            const email = req.user.email;
            const data = req.body;
            data.creator = email;
            data.createdAt = Date.now();
            data.order = 0;

            // updating order of task to place the new task at top
            await tasksCollection.updateMany({ creator: email, cat: data.cat }, { $inc: { order: 1 } });

            const result = await tasksCollection.insertOne(data);
            res.send(result);
        })

        // Load tasks of an user
        app.get("/tasks", verifyToken, async (req, res) => {
            const creator = req.user.email;
            const cursor = tasksCollection.find({ creator }).sort({order: 1});
            const result = await cursor.toArray();
            res.send(result);
        })

        app.put("/tasks/:id", verifyToken, async(req, res)=>{
            const id = req.params.id;
            const data = req.body;
            if(!id)return;
            const _id = new ObjectId(id);
            const result = await tasksCollection.updateOne({_id}, {
                $set: {
                    ...data
                }
            });
            res.send(result);
        })

        app.delete("/tasks/:id", verifyToken, async(req, res)=>{
            const id = req.params.id;
            if(!id)return;
            const result = await tasksCollection.deleteOne({_id: new ObjectId(id)});
            res.send(result);
        })

        // Update item
        app.put("/tasks", verifyToken, async (req, res) => {
            const creator = req.user.email;
            const payload = req.body;

            const targetCat = payload.targetCat;

            // the task which is modified
            const activeId = payload.active_id;

            const queryForMultipleEntries = {creator, cat: targetCat};
            const data = await tasksCollection.find({...queryForMultipleEntries}).toArray();

            let i= payload.overIndex;
            data.forEach(async entry=>{
                i++;
                await tasksCollection.updateOne({_id: new ObjectId(entry._id)}, {
                    $set: {
                        order: i
                    }
                })
            });
            
            await tasksCollection.updateOne({_id: new ObjectId(activeId)}, {
                $set: {
                    order: payload.overIndex,
                    cat: targetCat
                }
            })
        })

        // Create JWT after sign in
        app.post('/jwt', async (req, res) => {
            const user = req.body;

            const isUserExist = await usersCollection.findOne({ email: user.email });
            if (!isUserExist) {
                await usersCollection.insertOne(user);
            }

            const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '5h' });
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
            }).send({ success: true })
        })

        // Clear cookie after logging out
        app.post('/logout', (req, res) => {
            res.clearCookie('token', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
            }).send({ success: true })
        })


    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.listen(port, () => {
    console.log(`Server is running at ${port}`)
})