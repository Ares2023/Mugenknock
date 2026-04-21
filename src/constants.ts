export const API_ENDPOINT = 'https://a0q3656qw4.execute-api.ap-northeast-1.amazonaws.com/dev';

export const EXAM_TYPES = ['CLF', 'SAA', 'SAP'] as const;
export type ExamType = typeof EXAM_TYPES[number];

export const PASS_SCORE = 65;
