import { GoogleGenAI, Type } from "@google/genai";
import { searchFlights } from "./flightTool.js";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const flightToolDeclaration = {
    name: "searchFlights",
    description:
        "Search for flights with filters for cabin class, price, layovers, and travel dates.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            origin: {
                type: Type.STRING,
                description:
                    "3-letter IATA code for origin airport (e.g. DEL, JFK, BOM)",
            },
            destination: {
                type: Type.STRING,
                description:
                    "3-letter IATA code for destination airport (e.g. CDG, LHR, GOI)",
            },
            depart_date: {
                type: Type.STRING,
                description:
                    "Departure month or date in YYYY-MM or YYYY-MM-DD format",
            },
            return_date: {
                type: Type.STRING,
                description:
                    "Return month or date in YYYY-MM or YYYY-MM-DD format for round trips",
            },
            direct: {
                type: Type.BOOLEAN,
                description:
                    "Set to true for direct flights only; false for layovers",
            },
            cabin_class: {
                type: Type.STRING,
                enum: ["economy", "business", "first"],
                description: "Class of travel (economy, business, first)",
            },
            max_price: {
                type: Type.NUMBER,
                description: "Maximum budget per ticket in INR",
            },
            baggage_needed: {
                type: Type.BOOLEAN,
                description:
                    "Set to true if user specifically requested checked luggage options",
            },
        },
        required: ["origin", "destination"],
    },
};

// Updated active candidate models list (ordered by preference and active availability)
const CANDIDATE_MODELS = [
    "gemini-flash-latest",
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
    "gemini-2.5-flash",
];

/**
 * Helper to attempt generation with fallback models on 503/429 errors.
 */
async function generateWithFallback(params) {
    let lastError;
    for (const model of CANDIDATE_MODELS) {
        try {
            const response = await ai.models.generateContent({
                ...params,
                model,
            });
            return { response, model };
        } catch (err) {
            console.warn(
                `[Model Warning] ${model} failed: ${err.message}. Retrying with fallback...`,
            );
            lastError = err;
        }
    }
    throw lastError;
}

export async function runFlightAgent(userPrompt) {
    // Step 1: Send initial prompt + tools using the fallback strategy
    const { response, model: activeModel } = await generateWithFallback({
        contents: [userPrompt],
        config: {
            tools: [{ functionDeclarations: [flightToolDeclaration] }],
        },
    });

    // Step 2: Check if Gemini requested a tool call
    const functionCalls = response.functionCalls;

    if (functionCalls && functionCalls.length > 0) {
        const call = functionCalls[0];
        console.log(
            `[Agent Action] ${activeModel} requested tool: ${call.name} with args:`,
            call.args,
        );

        if (call.name === "searchFlights") {
            // Step 3: Execute local Node.js function
            const flightData = await searchFlights(call.args);

            // System instruction in geminiAgent.js (Step 4 follow-up call)
            const systemInstruction = `
You are an expert travel assistant. Analyze the provided flight data accurately based on actual airline models:

1. CARRIER TYPES & CABIN REALITY:
   - Full-Service Carriers (e.g., Air India, Vistara): Offer true Business Class cabins with dedicated wide seats, complimentary hot meals, lounge access, and 25-35kg luggage.
   - Low-Cost Carriers (e.g., Air India Express, IndiGo, Akasa Air, SpiceJet): Operate all-economy fleets. Higher fares or premium seats (like Xpress Biz or IndiGo XL) offer extra legroom or bundled snacks, NOT traditional luxury Business Class cabins or free gourmet hot meals.
   
2. ACCURACY CHECKS:
   - If a flight belongs to a Low-Cost Carrier, clearly state that it is a Low-Cost / Premium Economy style seat rather than calling it a full-service Business Class cabin.
   - If the user explicitly requested "Business Class" and only LCC options returned in the price budget, clarify the distinction so the user isn't misled.

3. BAGGAGE & FACILITIES:
   - Accurately describe standard baggage policies based on carrier type (LCC domestic is typically 15kg unless bundled; Full-Service domestic is typically 20-25kg for economy and 30-35kg for Business Class).
`;

            // Step 4: Pass tool result back to Gemini using the active model
            const { response: followUpResponse } = await generateWithFallback({
                contents: [
                    { role: "user", parts: [{ text: userPrompt }] },
                    {
                        role: "model",
                        parts: response.candidates[0].content.parts,
                    },
                    {
                        role: "user",
                        parts: [
                            {
                                functionResponse: {
                                    name: "searchFlights",
                                    response: flightData,
                                },
                            },
                            { text: systemInstruction },
                        ],
                    },
                ],
            });

            // Step 5: Return final response
            return followUpResponse.text;
        }
    }

    return response.text;
}
