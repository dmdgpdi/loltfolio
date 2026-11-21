import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** @description 테스트와 모듈 mock이 tsconfig의 @/* 별칭과 같은 소스를 참조하도록 설정한다. */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
