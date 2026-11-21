/** @description 새 접수와 기존 활성 작업 공유를 구분하며 수집 성공을 의미하지 않는다. */
export type MatchCollectionAdmissionResult = Readonly<{
  jobId: string;
  created: boolean;
}>;
