export const resolveStudentUserId = (user) => (
  user?.user_id
  || user?.id
  || user?.studentId
  || user?.username
  || ''
).toString().trim();

