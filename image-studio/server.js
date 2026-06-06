
import express from "express";
import dotenv from "dotenv";

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

dotenv.config();

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

app.post("/generate", async (req, res) => {
  try {
    const userPrompt = req.body.prompt;

    const claudeResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-0",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content:
            `Améliore ce prompt pour générer une image ultra réaliste:\n${userPrompt}`
        }
      ]
    });

    const enhancedPrompt =
      claudeResponse.content[0].text;

    const image = await openai.images.generate({
      model: "gpt-image-1",
      prompt: enhancedPrompt,
      size: "1024x1024"
    });

    res.json({
      success: true,
      prompt: enhancedPrompt,
      image: image.data[0].b64_json
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message
    });
  }
});

app.listen(3000, () => {
  console.log("Serveur IA lancé sur http://localhost:3000");
});
