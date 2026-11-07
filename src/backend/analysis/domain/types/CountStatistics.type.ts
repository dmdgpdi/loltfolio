/** @description 동일 유효 표본의 행동 횟수 규모와 발생 빈도. 실제 0은 평균에 포함하고 발생 경기 수는 양수 관측만 센다. */
export type CountStatistics = Readonly<{
  total: number;
  average: number;
  maximum: number;
  occurredMatchCount: number;
}>;
