import fs from 'fs';

const apiKey = process.env.OPENAI_API_KEY;
const body = {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Hello!" }]
};

fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
})
    .then(res => res.json().then(data => ({ status: res.status, data })))
    .then(res => {
        console.log("Status:", res.status);
        console.log(JSON.stringify(res.data, null, 2));
    })
    .catch(err => console.error("Fetch error:", err));
