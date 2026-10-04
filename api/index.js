const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'project_hub_super_secret_jwt_key_2026';
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://johneukie103006_db_user:RevillaPass2026@cluster0.xchqcfk.mongodb.net/project_hub?retryWrites=true&w=majority&appName=Cluster0";

// Serverless MongoDB connection cache
let isConnected = false;
async function connectDB() {
  if (isConnected || mongoose.connection.readyState === 1) {
    isConnected = true;
    return;
  }
  await mongoose.connect(MONGO_URI);
  isConnected = true;
}

connectDB().catch(err => console.error("MongoDB Atlas connection error:", err));

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Middleware to ensure DB connection per serverless call
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    res.status(500).json({ error: "Database connection failed" });
  }
});

// Schemas & Models
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  avatar: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

const activitySchema = new mongoose.Schema({
  title: { type: String, required: true },
  status: { type: String, default: 'In Progress' },
  date: { type: String, default: 'Oct 2026' },
  notes: { type: String, default: '' },
  tags: [{ type: String }],
  image: { type: String, default: null },
  fileName: { type: String, default: null },
  fileSize: { type: String, default: null },
  fileData: { type: String, default: null }
});

const projectSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  category: { type: String, default: 'Other / General' },
  icon: { type: String, default: '📁' },
  description: { type: String, default: '' },
  favorite: { type: Boolean, default: false },
  activities: [activitySchema],
  createdAt: { type: Date, default: Date.now }
});

const Project = mongoose.models.Project || mongoose.model('Project', projectSchema);

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: "Access token required." });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid or expired session token." });
    req.user = user;
    next();
  });
}

// 1. Auth Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, avatar } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(400).json({ error: "An account with this Gmail already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      name: name.trim(),
      email: cleanEmail,
      password: hashedPassword,
      avatar: avatar || null
    });

    await user.save();

    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, avatar: user.avatar }
    });
  } catch (err) {
    res.status(500).json({ error: "Server registration failed: " + err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Please provide both Gmail and password." });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(400).json({ error: "No account found with this Gmail address." });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ error: "Incorrect password." });
    }

    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, avatar: user.avatar }
    });
  } catch (err) {
    res.status(500).json({ error: "Server login error: " + err.message });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ error: "User profile not found." });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    const { name, avatar } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Display name cannot be empty." });

    const updateFields = { name: name.trim() };
    if (avatar !== undefined) updateFields.avatar = avatar;

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateFields },
      { new: true }
    ).select('-password');

    res.json({
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        avatar: updatedUser.avatar
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to update profile: " + err.message });
  }
});

// 2. Public Read-Only Share & Download
app.get('/api/public/projects/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .select('-activities.fileData')
      .populate('userId', 'name avatar');
    if (!project) return res.status(404).json({ error: "Shared project not found." });
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/public/projects/:projectId/activities/:actId/download', async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found." });

    const act = project.activities.id(req.params.actId);
    if (!act || !act.fileData) return res.status(404).json({ error: "File data not found." });

    res.json({ fileName: act.fileName, fileData: act.fileData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Project CRUD Routes
app.get('/api/projects', authenticateToken, async (req, res) => {
  try {
    const projects = await Project.find({ userId: req.user.id })
      .select('-activities.fileData')
      .sort({ createdAt: -1 });
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/projects', authenticateToken, async (req, res) => {
  try {
    const { name, category, icon, description } = req.body;
    const project = new Project({
      userId: req.user.id,
      name,
      category: category || 'Other / General',
      icon: icon || '📁',
      description: description || ''
    });
    await project.save();
    res.status(201).json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/projects/:id', authenticateToken, async (req, res) => {
  try {
    const { name, category, icon, description, favorite } = req.body;
    const project = await Project.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: { name, category, icon, description, favorite } },
      { new: true }
    ).select('-activities.fileData');
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/projects/:id', authenticateToken, async (req, res) => {
  try {
    await Project.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    res.json({ message: "Project deleted successfully." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Activities CRUD Routes
app.post('/api/projects/:id/activities', authenticateToken, async (req, res) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, userId: req.user.id });
    if (!project) return res.status(404).json({ error: "Project not found." });

    project.activities.push(req.body);
    await project.save();
    res.status(201).json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/projects/:projectId/activities/:actId', authenticateToken, async (req, res) => {
  try {
    const project = await Project.findOne({ _id: req.params.projectId, userId: req.user.id });
    if (!project) return res.status(404).json({ error: "Project not found." });

    const act = project.activities.id(req.params.actId);
    if (!act) return res.status(404).json({ error: "Activity not found." });

    Object.assign(act, req.body);
    await project.save();
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/projects/:projectId/activities/:actId', authenticateToken, async (req, res) => {
  try {
    const project = await Project.findOne({ _id: req.params.projectId, userId: req.user.id });
    if (!project) return res.status(404).json({ error: "Project not found." });

    project.activities.pull({ _id: req.params.actId });
    await project.save();
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;