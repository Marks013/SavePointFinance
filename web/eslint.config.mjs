<<<<<<< HEAD
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
=======
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname
});
>>>>>>> 0dedb8a7d2d2c175ec23cd8d26bbf112193bdd5a

const eslintConfig = [
  {
    ignores: [".next/**", "node_modules/**", ".npm-cache/**", "next-env.d.ts"]
  },
<<<<<<< HEAD
  ...nextCoreWebVitals,
  ...nextTypescript
=======
  ...compat.extends("next/core-web-vitals", "next/typescript")
>>>>>>> 0dedb8a7d2d2c175ec23cd8d26bbf112193bdd5a
];

export default eslintConfig;
