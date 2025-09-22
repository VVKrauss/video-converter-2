import { Worker } from "bullmq";
import { connection } from "./queue.js";
import { transcode } from "./ffmpeg.js";
import { supabase } from "./supabase.js";

const worker = new Worker("video-transcode", async job => {
  await transcode(job.data.filePath, job.id, async (stage, percent) => {
    console.log(`Job ${job.id}: ${stage} → ${percent}%`);
    // сохраняем прогресс в таблицу Supabase
    await supabase.from("transcode_jobs").upsert({
      id: job.id,
      file_path: job.data.filePath,
      status: stage,
      progress: percent,
    });
  });
}, { connection });

console.log("Worker started...");
