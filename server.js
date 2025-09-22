import express from "express";
import { videoQueue } from "./queue.js";
import { supabase } from "./supabase.js";

const app = express();
app.use(express.json());

app.post("/api/transcode", async (req, res) => {
  const { filePath, userId } = req.body;
  const job = await videoQueue.add("transcode", { filePath, userId });

  // Сохраняем начальное состояние в Supabase
  await supabase.from("transcode_jobs").insert({
    id: job.id,
    file_path: filePath,
    status: "queued",
    progress: 0,
    user_id: userId || null
  });

  res.json({ jobId: job.id });
});

app.get("/api/progress/:id", async (req, res) => {
  const { data, error } = await supabase
    .from("transcode_jobs")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error) return res.status(404).json({ error: "Job not found" });
  res.json(data);
});

app.listen(3000, () => {
  console.log("API server running on port 3000");
});
