import path from "path";
import { fileURLToPath } from "url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  plugins: {
    tailwindcss: {
      config: path.join(dirname, "tailwind.config.ts"),
    },
    autoprefixer: {},
  },
};
