import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import { supabase, bucket } from "./supabase.js";

function getScaleCommand(resolution) {
  switch (resolution) {
    case 480: return "scale=-2:480";
    case 720: return "scale=-2:720";
    case 1080: return "scale=-2:1080";
    case 2160: return "scale=-2:2160"; // 4K
  }
}

export async function transcode(filePath, jobId, progressCb) {
  const fileName = path.basename(filePath);
  const tmpFile = `/tmp/${fileName}`;

  // 1. Скачиваем файл из Supabase
  progressCb("download", 5);
  const { data, error } = await supabase.storage.from(bucket).download(filePath);
  if (error) throw error;
  const buffer = Buffer.from(await data.arrayBuffer());
  fs.writeFileSync(tmpFile, buffer);

  // 2. Узнаем разрешение
  progressCb("analyze", 15);
  let resolutions = [480, 720, 1080, 2160];
  let targetRes = [];

  await new Promise((resolve, reject) => {
    ffmpeg.ffprobe(tmpFile, (err, metadata) => {
      if (err) return reject(err);
      const height = metadata.streams.find(s => s.height)?.height || 480;
      targetRes = resolutions.filter(r => r <= height);
      resolve();
    });
  });

  // 3. Конвертация и загрузка
  for (const res of targetRes) {
    await new Promise((resolve, reject) => {
      const outFile = `/tmp/${res}_${fileName}`;
      ffmpeg(tmpFile)
        .videoCodec("libx264")
        .audioCodec("aac")
        .outputOptions(["-preset fast", "-crf 23"])
        .videoFilters(getScaleCommand(res))
        .on("progress", p => {
          const percent = Math.min(95, Math.round(p.percent || 0));
          progressCb(`convert_${res}`, percent);
        })
        .on("end", async () => {
          const { error: upErr } = await supabase.storage
            .from(bucket)
            .upload(`${res}p/${fileName}`, fs.createReadStream(outFile), {
              contentType: "video/mp4",
              upsert: true,
            });
          fs.unlinkSync(outFile);
          if (upErr) return reject(upErr);
          progressCb(`upload_${res}`, 100);
          resolve();
        })
        .on("error", reject)
        .save(outFile);
    });
  }

  fs.unlinkSync(tmpFile);
  progressCb("done", 100);
}
