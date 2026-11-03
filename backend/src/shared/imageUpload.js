import multer from "multer";

// One shared multer instance for every image upload route. Uploads land in
// public Supabase buckets, so only plain raster images are accepted: no SVG
// (can carry <script>) and no HTML/JS disguised with an image extension.
const ALLOWED = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
};

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    const ext = (file.originalname.match(/\.\w+$/) || [""])[0].toLowerCase();
    const okExts = ALLOWED[file.mimetype];
    if (!okExts || !okExts.includes(ext)) {
      const err = new Error("Only JPG, PNG, WEBP, or GIF images are allowed");
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  },
});
