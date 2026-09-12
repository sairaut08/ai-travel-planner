// flightTool.js
export async function searchFlights({
    origin,
    destination,
    depart_date,
    return_date,
    direct = false,
    cabin_class = "economy",
    max_price,
    baggage_needed = false,
}) {
    const token = process.env.TRAVELPAYOUTS_TOKEN;

    let url = `https://api.travelpayouts.com/v1/prices/cheap?origin=${origin}&destination=${destination}&currency=INR&token=${token}`;

    if (depart_date) url += `&depart_date=${depart_date}`;
    if (return_date) url += `&return_date=${return_date}`;
    if (direct) url += `&direct=true`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (
            !response.ok ||
            !data.success ||
            !data.data ||
            Object.keys(data.data).length === 0
        ) {
            return {
                success: false,
                message: `No active flight data found for ${origin} to ${destination} with the requested criteria.`,
            };
        }

        // Return search data along with user preference metadata for Gemini's reasoning pass
        return {
            success: true,
            queryMeta: { cabin_class, max_price, baggage_needed },
            flightData: data.data,
        };
    } catch (err) {
        return {
            error: true,
            message: `Network error while fetching flights: ${err.message}`,
        };
    }
}
