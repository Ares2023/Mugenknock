import { referenceAuth } from '@aws-amplify/backend';

export const auth = referenceAuth({
  userPoolId: 'ap-northeast-1_KIOFciGhQ',
  identityPoolId: 'ap-northeast-1:cc252cc1-4874-4fa1-8585-27d04666be88',
  userPoolClientId: '16jjrj5m28o6s2k84og8kh2vh3',
  authRoleArn: 'arn:aws:iam::570827308321:role/amplify-awsquizapp-dev-15ac9-authRole',
  unauthRoleArn: 'arn:aws:iam::570827308321:role/amplify-awsquizapp-dev-15ac9-unauthRole',
});
