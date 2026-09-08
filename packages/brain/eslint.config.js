import js from "@eslint/js";
import tseslint from "typescript-eslint";
import functional from "eslint-plugin-functional";

export default tseslint.config(
  { ignores: ["node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  functional.configs.lite,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      complexity: ["error", 8],
      "max-depth": ["error", 3],
      "max-params": ["error", 4],
      "max-statements": ["error", 20],
      "max-lines-per-function": [
        "error",
        { max: 60, skipBlankLines: true, skipComments: true },
      ],
      // The API is a stateful simulator driven through callbacks (sense, act, setDrive).
      // Those functions exist to change simulator state and have nothing to return.
      "functional/no-return-void": "off",
      // Maps and Sets are used as accumulators in setup code and examples.
      "functional/immutable-data": [
        "error",
        { ignoreClasses: "fieldsOnly", ignoreMapsAndSets: true },
      ],
      "functional/prefer-immutable-types": [
        "error",
        { enforcement: "None", ignoreClasses: true },
      ],
    },
  },
  {
    // The simulation core. `tick` visits every neuron and every synapse of a spiking
    // neuron on each 0.1 ms step, so it writes typed arrays in place inside plain loops.
    // `times` is the one loop that advances simulated time.
    files: ["src/lif.ts", "src/util.ts"],
    rules: {
      "functional/no-loop-statements": "off",
      "functional/no-let": "off",
      "functional/immutable-data": "off",
    },
  },
);
