/** @description DB가 발급한 작업 실행 권한이다. 갱신은 토큰을 유지하고 선점·목적 변경은 새 토큰을 발급한다. */
export type ExecutionLease = Readonly<{
  jobId: string;
  executionToken: string;
  purpose: "COLLECT" | "FINALIZE";
  leaseExpiresAt: Date;
}>;
