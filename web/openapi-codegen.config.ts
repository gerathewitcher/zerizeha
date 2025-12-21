import { defineConfig } from "@openapi-codegen/cli";
import {
  generateFetchers,
  generateSchemaTypes,
} from "@openapi-codegen/typescript";

export default defineConfig({
  api: {
    from: {
      source: "file",
      relativePath: "../backend/docs/openapi.yaml",
    },
    outputDir: "src/lib/api/generated",
    to: async (context) => {
      const filenamePrefix = "zerizeha";
      const { schemasFiles } = await generateSchemaTypes(context, {
        filenamePrefix,
        filenameCase: "kebab",
      });

      await generateFetchers(context, {
        filenamePrefix,
        filenameCase: "kebab",
        schemasFiles,
        injectedHeaders: ["Authorization"],
      });
    },
  },
});
