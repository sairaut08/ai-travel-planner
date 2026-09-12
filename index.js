import express from "express";
import dotenv from "dotenv";
import { runFlightAgent } from "./geminiAgent.js";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get("/health", (req, res) => {
    res.json({ status: "ok", message: "Travel Planner API is running" });
});

// Main endpoint trigger for Phase 1 Flight Agent
app.post("/api/plan-trip", async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: "Prompt is required" });
        }

        const result = await runFlightAgent(prompt);
        res.json({ result });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
