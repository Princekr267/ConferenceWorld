import httpStatus from "http-status";
import { User } from "../models/user.model.js";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { Meeting } from "../models/meeting.model.js"

// Meeting codes: exactly 10 lowercase alphanumeric characters
const MEETING_CODE_REGEX = /^[a-z0-9]{10}$/;

const login = async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required." });
    }
    if (typeof username !== 'string' || username.length > 30) {
        return res.status(400).json({ message: "Invalid username." });
    }
    if (typeof password !== 'string' || password.length > 128) {
        return res.status(400).json({ message: "Invalid password." });
    }

    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(httpStatus.NOT_FOUND).json({ message: "User not found." });
        }
        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) {
            return res.status(httpStatus.UNAUTHORIZED).json({ message: "Invalid username or password." });
        }
        const token = crypto.randomBytes(20).toString("hex");
        user.token = token;
        await user.save();
        return res.status(httpStatus.OK).json({ token });
    } catch (e) {
        return res.status(500).json({ message: "Something went wrong." });
    }
};

const register = async (req, res) => {
    const { name, username, password } = req.body;

    if (!name || !username || !password) {
        return res.status(400).json({ message: "Name, username, and password are required." });
    }
    if (typeof name !== 'string' || name.length > 50) {
        return res.status(400).json({ message: "Name must be 50 characters or fewer." });
    }
    if (typeof username !== 'string' || username.length > 30) {
        return res.status(400).json({ message: "Username must be 30 characters or fewer." });
    }
    if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
        return res.status(400).json({ message: "Password must be between 6 and 128 characters." });
    }

    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(httpStatus.FOUND).json({ message: "Username already taken." });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ name, username, password: hashedPassword });
        await newUser.save();
        return res.status(httpStatus.CREATED).json({ message: "User registered successfully." });
    } catch (e) {
        return res.status(500).json({ message: "Something went wrong." });
    }
};

const getUserHistory = async (req, res) => {
    const {token} = req.query;
    try{
        const user = await User.findOne({token: token});
        const meetings = await Meeting.find({user_id: user.username});
        res.json(meetings)
    } catch (e) {
        res.json({message: `Something went wrong ${e}`})
    }
}

const addToHistory = async (req, res) => {
    const { token, meetingCode } = req.body;

    if (!token || !meetingCode) {
        return res.status(400).json({ message: "Token and meeting code are required." });
    }
    if (!MEETING_CODE_REGEX.test(meetingCode)) {
        return res.status(400).json({ message: "Invalid meeting code format." });
    }

    try {
        const user = await User.findOne({ token });
        if (!user) return res.status(httpStatus.UNAUTHORIZED).json({ message: "Invalid session." });

        const newMeeting = new Meeting({ user_id: user.username, meetingCode });
        await newMeeting.save();
        return res.status(httpStatus.CREATED).json({ message: "Added to history." });
    } catch (e) {
        return res.status(500).json({ message: "Something went wrong." });
    }
};

const getProfile = async (req, res) => {
    const { token } = req.query;
    try {
        const user = await User.findOne({ token });
        if (!user) {
            return res.status(httpStatus.NOT_FOUND).json({ message: "User not found" });
        }
        res.status(httpStatus.OK).json({ name: user.name, username: user.username });
    } catch (e) {
        res.status(500).json({ message: `Something went wrong ${e}` });
    }
};

export {login, register, getUserHistory, addToHistory, getProfile};