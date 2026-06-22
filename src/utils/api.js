/**
 * API utility functions for student frontend to communicate with the backend
 */

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '/api/v1';

/**
 * Get authentication headers
 */
const getAuthHeaders = () => {
  const token = localStorage.getItem('student_access_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

/**
 * Handle API errors
 */
const handleApiError = async (response) => {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || errorData.message || `HTTP error! status: ${response.status}`);
  }
  return response;
};

/**
 * Student Authentication APIs
 */
export const authAPI = {
  /**
   * Login student
   */
  login: async (studentId, password) => {
    try {
      const response = await fetch(`${API_BASE_URL}/student/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          username: studentId, 
          password: password 
        }),
      });

      await handleApiError(response);
      const data = await response.json();

      // Store tokens
      if (data.access_token) {
        localStorage.setItem('student_access_token', data.access_token);
      }
      if (data.refresh_token) {
        localStorage.setItem('student_refresh_token', data.refresh_token);
      }

      return data;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  },

  /**
   * Get quiz by ID
   */
  getQuizById: async (quizId, options = {}) => {
    try {
      const params = new URLSearchParams();
      if (options.userId) params.set('user_id', String(options.userId));
      if (options.courseId) params.set('course_id', String(options.courseId));
      const query = params.toString();
      const response = await fetch(`${API_BASE_URL}/student/quizzes/${encodeURIComponent(quizId)}${query ? `?${query}` : ''}`, {
        headers: getAuthHeaders(),
      });
      await handleApiError(response);
      return await response.json();
    } catch (error) {
      console.error('Get quiz by id failed:', error);
      throw error;
    }
  },

  /**
   * Get lesson by ID
   */
  getLessonById: async (lessonId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/student/lessons/${encodeURIComponent(lessonId)}`, {
        headers: getAuthHeaders(),
      });
      await handleApiError(response);
      return await response.json();
    } catch (error) {
      console.error('Get lesson by id failed:', error);
      throw error;
    }
  },

  /**
   * Get current user info
   */
  getCurrentUser: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/student/auth/me`, {
        headers: getAuthHeaders(),
      });

      await handleApiError(response);
      return await response.json();
    } catch (error) {
      console.error('Get current user failed:', error);
      throw error;
    }
  },

  /**
   * Logout student
   */
  logout: async () => {
    try {
      const token = localStorage.getItem('student_access_token');
      if (token) {
        await fetch(`${API_BASE_URL}/student/auth/logout`, {
          method: 'POST',
          headers: getAuthHeaders(),
        });
      }
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      // Always clear local storage
      localStorage.removeItem('student_access_token');
      localStorage.removeItem('student_refresh_token');
    }
  },

  /**
   * Refresh access token
   */
  refreshToken: async () => {
    try {
      const refreshToken = localStorage.getItem('student_refresh_token');
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await fetch(`${API_BASE_URL}/student/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      await handleApiError(response);
      const data = await response.json();

      if (data.access_token) {
        localStorage.setItem('student_access_token', data.access_token);
      }

      return data;
    } catch (error) {
      console.error('Token refresh failed:', error);
      // Clear tokens on refresh failure
      localStorage.removeItem('student_access_token');
      localStorage.removeItem('student_refresh_token');
      throw error;
    }
  }
};

/**
 * Course and Quiz APIs
 */
export const courseAPI = {
  /**
   * Get quiz by ID (student view)
   */
  getQuizById: async (quizId, options = {}) => {
    try {
      const params = new URLSearchParams();
      if (options.userId) params.set('user_id', String(options.userId));
      if (options.courseId) params.set('course_id', String(options.courseId));
      const query = params.toString();
      const response = await fetch(`${API_BASE_URL}/student/quizzes/${encodeURIComponent(quizId)}${query ? `?${query}` : ''}`, {
        headers: getAuthHeaders(),
      });
      await handleApiError(response);
      return await response.json();
    } catch (error) {
      console.error('Get quiz by id failed:', error);
      throw error;
    }
  },
  /**
   * Get user's enrolled courses
   */
  getUserCourses: async (userId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/student/users/${userId}/enrolled-courses`, {
        headers: getAuthHeaders(),
      });

      await handleApiError(response);
      return await response.json();
    } catch (error) {
      console.error('Get user enrolled courses failed:', error);
      throw error;
    }
  },

  /**
   * Get enrolled courses plus computed dashboard learning stats in one request
   */
  getDashboardLearningSummary: async (userId, options = {}) => {
    try {
      const params = new URLSearchParams();
      if (options.includeAi != null) params.set('include_ai', String(Boolean(options.includeAi)));
      if (options.courseLimit) params.set('course_limit', String(options.courseLimit));
      const query = params.toString();
      const response = await fetch(
        `${API_BASE_URL}/student/users/${encodeURIComponent(userId)}/dashboard-learning-summary${query ? `?${query}` : ''}`,
        {
          headers: getAuthHeaders(),
        }
      );
      await handleApiError(response);
      return await response.json();
    } catch (error) {
      console.error('Get dashboard learning summary failed:', error);
      throw error;
    }
  },

  /**
   * Get compact course detail data for the learning page in one request
   */
  getCourseLearningOverview: async (courseId, options = {}) => {
    try {
      const params = new URLSearchParams();
      if (options.userId) params.set('user_id', String(options.userId));
      const query = params.toString();
      const response = await fetch(
        `${API_BASE_URL}/student/courses/${encodeURIComponent(courseId)}/learning-overview${query ? `?${query}` : ''}`,
        {
          headers: getAuthHeaders(),
        }
      );
      await handleApiError(response);
      return await response.json();
    } catch (error) {
      console.error('Get course learning overview failed:', error);
      throw error;
    }
  },

  /**
   * Record a lesson-view activity day for dashboard consistency
   */
  recordLearningActivity: async (userId, payload = {}) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/student/users/${encodeURIComponent(userId)}/learning-activity`,
        {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            course_id: payload.courseId || payload.course_id,
            lesson_id: payload.lessonId || payload.lesson_id || null,
            activity_day: payload.activityDay || payload.activity_day || null,
            activity_days: Array.isArray(payload.activityDays)
              ? payload.activityDays
              : (Array.isArray(payload.activity_days) ? payload.activity_days : []),
          }),
        }
      );
      await handleApiError(response);
      return await response.json();
    } catch (error) {
      console.error('Record learning activity failed:', error);
      throw error;
    }
  },

  /**
   * Get all courses on the platform
   */
  getAllCourses: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/student/courses`, {
        headers: getAuthHeaders(),
      });
      await handleApiError(response);
      return await response.json();
    } catch (error) {
      console.error('Get all courses failed:', error);
      throw error;
    }
  },

  /**
   * Enroll current user to a course
   */
  enroll: async (userId, courseId, options = {}) => {
    try {
      const form = new FormData();
      form.append('user_id', userId);
      form.append('course_id', courseId);
      if (options.mode) {
        form.append('enrollment_mode', String(options.mode));
      }

      const authHeaders = getAuthHeaders();
      delete authHeaders['Content-Type'];

      const response = await fetch(`${API_BASE_URL}/student/enrollments`, {
        method: 'POST',
        body: form,
        headers: authHeaders,
      });

      await handleApiError(response);
      return await response.json();
    } catch (error) {
      console.error('Enroll failed:', error);
      throw error;
    }
  },

  /**
   * Create Stripe PromptPay payment intent for course purchase
   */
  createPromptPayIntent: async (userId, courseId, options = {}) => {
    try {
      const payload = {
        user_id: userId,
        course_id: courseId,
        amount_thb: Number.isFinite(Number(options?.amountThb)) ? Number(options.amountThb) : null,
        plan_label: options?.planLabel || null,
        duration_months: Number.isFinite(Number(options?.durationMonths))
          ? Number(options.durationMonths)
          : null,
      };
      const billingEmail = String(options?.billingEmail || '').trim();
      if (billingEmail) {
        payload.billing_email = billingEmail;
      }
      const response = await fetch(`${API_BASE_URL}/student/payments/promptpay/create-intent`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      await handleApiError(response);
      return await response.json();
    } catch (error) {
      console.error('Create PromptPay payment intent failed:', error);
      throw error;
    }
  },

  /**
   * Confirm Stripe payment intent and enroll user when payment succeeds
   */
  confirmPromptPayPayment: async (userId, courseId, paymentIntentId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/student/payments/promptpay/confirm`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          user_id: userId,
          course_id: courseId,
          payment_intent_id: paymentIntentId,
        }),
      });
      await handleApiError(response);
      return await response.json();
    } catch (error) {
      console.error('Confirm PromptPay payment failed:', error);
      throw error;
    }
  },

  /**
   * Get user payment history from enrollments/payment records
   */
  getPaymentHistory: async (userId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/student/users/${encodeURIComponent(userId)}/payment-history`, {
        headers: getAuthHeaders(),
      });
      await handleApiError(response);
      return await response.json();
    } catch (error) {
      console.error('Get payment history failed:', error);
      throw error;
    }
  },

  /**
   * Get quizzes for a specific course
   */
  getCourseQuizzes: async (userId, courseId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/student/users/${userId}/quizzes?course_id=${courseId}`, {
        headers: getAuthHeaders(),
      });

      await handleApiError(response);
      return await response.json();
    } catch (error) {
      console.error('Get course quizzes failed:', error);
      throw error;
    }
  },

  /**
   * Get quizzes for a course (any instructor)
   */
  getQuizzesByCourse: async (courseId, options = {}) => {
    try {
      const params = new URLSearchParams();
      if (options.userId) params.set('user_id', String(options.userId));
      if (options.q) params.set('q', String(options.q));
      if (options.difficulty) params.set('difficulty', String(options.difficulty));
      if (options.sort) params.set('sort', String(options.sort));
      if (options.page) params.set('page', String(options.page));
      if (options.pageSize) params.set('page_size', String(options.pageSize));
      if (Array.isArray(options.quizIds) && options.quizIds.length > 0) {
        params.set('quiz_ids', options.quizIds.join(','));
      }
      const query = params.toString();
      const response = await fetch(`${API_BASE_URL}/student/courses/${courseId}/quizzes${query ? `?${query}` : ''}`, {
        headers: getAuthHeaders(),
      });
      await handleApiError(response);
      return await response.json();
    } catch (error) {
      console.error('Get quizzes by course failed:', error);
      throw error;
    }
  },

  /**
   * Get lessons for a specific course
   */
  getCourseLessons: async (courseId, options = {}) => {
    try {
      const params = new URLSearchParams();
      if (options.userId) params.set('user_id', String(options.userId));
      const query = params.toString();
      const response = await fetch(`${API_BASE_URL}/student/courses/${courseId}/lessons${query ? `?${query}` : ''}`, {
        headers: getAuthHeaders(),
      });

      await handleApiError(response);
      return await response.json();
    } catch (error) {
      console.error('Get course lessons failed:', error);
      throw error;
    }
  },

  /**
   * Get all user quizzes
   */
  getUserQuizzes: async (userId, limit = 50) => {
    try {
      const response = await fetch(`${API_BASE_URL}/student/users/${userId}/quizzes?limit=${limit}`, {
        headers: getAuthHeaders(),
      });

      await handleApiError(response);
      return await response.json();
    } catch (error) {
      console.error('Get user quizzes failed:', error);
      throw error;
    }
  },

  /**
   * Get user quiz submission results (real attempts)
   */
  getUserQuizResults: async (userId, options = {}) => {
    try {
      const params = new URLSearchParams();
      if (options.courseId) params.set('course_id', String(options.courseId));
      if (options.quizId) params.set('quiz_id', String(options.quizId));
      const query = params.toString();

      const response = await fetch(`${API_BASE_URL}/student/users/${userId}/quiz-results${query ? `?${query}` : ''}`, {
        headers: getAuthHeaders(),
      });

      await handleApiError(response);
      return await response.json();
    } catch (error) {
      console.error('Get user quiz results failed:', error);
      throw error;
    }
  },

  /**
   * Submit quiz answers
   */
  submitQuizAnswers: async (userId, quizId, payload) => {
    try {
      const response = await fetch(`${API_BASE_URL}/student/users/${userId}/quizzes/${quizId}/submit`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(
          // Accept either an array/object of answers or a full payload
          (payload && (payload.answers !== undefined || Array.isArray(payload)))
            ? (payload.answers !== undefined ? payload : { answers: payload })
            : { answers: [] }
        ),
      });

      await handleApiError(response);
      return await response.json();
    } catch (error) {
      console.error('Submit quiz answers failed:', error);
      throw error;
    }
  },

  /**
   * Get quiz results
   */
  getQuizResults: async (userId, quizId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/student/users/${userId}/quizzes/${quizId}/results`, {
        headers: getAuthHeaders(),
      });

      await handleApiError(response);
      return await response.json();
    } catch (error) {
      console.error('Get quiz results failed:', error);
      throw error;
    }
  },

  /**
   * Get mock-exam leaderboard for a course
   */
  getCourseMockExamLeaderboard: async (courseId, limit = 50) => {
    try {
      const response = await fetch(`${API_BASE_URL}/student/courses/${courseId}/mock-exam-leaderboard?limit=${limit}`, {
        headers: getAuthHeaders(),
      });

      await handleApiError(response);
      return await response.json();
    } catch (error) {
      console.error('Get course mock exam leaderboard failed:', error);
      throw error;
    }
  },

  /**
   * Generate student analysis summary using backend LLM provider.
   */
  getStudentAnalysisSummary: async (userId, courseId, payload = {}) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/student/users/${encodeURIComponent(userId)}/courses/${encodeURIComponent(courseId)}/analysis-summary`,
        {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload || {}),
        }
      );
      await handleApiError(response);
      return await response.json();
    } catch (error) {
      console.error('Get student analysis summary failed:', error);
      throw error;
    }
  }
};

/**
 * Chat API
 */
export const chatAPI = {
  buildChatFormData: (
    message,
    userId,
    courseId = null,
    conversationId = null,
    questionContext = null,
    imageFile = null,
    chatMode = 'study_solver'
  ) => {
    const formData = new FormData();
    formData.append('message', message);
    formData.append('user_id', userId);
    formData.append('chat_mode', chatMode || 'study_solver');

    if (courseId) {
      formData.append('course_id', courseId);
    }

    if (conversationId) {
      formData.append('conversation_id', conversationId);
    }

    if (questionContext) {
      const serializedContext = typeof questionContext === 'string'
        ? questionContext
        : JSON.stringify(questionContext);
      formData.append('question_context', serializedContext);
    }

    if (imageFile) {
      formData.append('image', imageFile);
    }

    return formData;
  },

  /**
   * Send message to AI chat
   */
  sendMessage: async (
    message,
    userId,
    courseId = null,
    conversationId = null,
    questionContext = null,
    imageFile = null,
    chatMode = 'study_solver'
  ) => {
    try {
      const formData = chatAPI.buildChatFormData(
        message,
        userId,
        courseId,
        conversationId,
        questionContext,
        imageFile,
        chatMode
      );

      const authHeaders = getAuthHeaders();
      // Remove Content-Type from auth headers for FormData
      delete authHeaders['Content-Type'];

      const response = await fetch(`${API_BASE_URL}/student/chat`, {
        method: 'POST',
        body: formData,
        headers: authHeaders
      });

      await handleApiError(response);
      return await response.json();
    } catch (error) {
      console.error('Send chat message failed:', error);
      throw error;
    }
  },

  /**
   * Get student chat energy status
   */
  getEnergyStatus: async (userId) => {
    try {
      const normalizedUserId = String(userId || '').trim();
      if (!normalizedUserId) {
        throw new Error('user_id is required');
      }
      const response = await fetch(
        `${API_BASE_URL}/student/chat/energy?user_id=${encodeURIComponent(normalizedUserId)}`,
        {
          headers: getAuthHeaders(),
        }
      );
      await handleApiError(response);
      return await response.json();
    } catch (error) {
      console.error('Get chat energy status failed:', error);
      throw error;
    }
  }
};

/**
 * Auto-retry with token refresh for authenticated requests
 */
const apiWithTokenRefresh = async (apiCall) => {
  try {
    return await apiCall();
  } catch (error) {
    // If unauthorized, try to refresh token and retry once
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      try {
        await authAPI.refreshToken();
        return await apiCall();
      } catch (refreshError) {
        // Refresh failed, redirect to login
        console.error('Token refresh failed, redirecting to login');
        localStorage.removeItem('student_access_token');
        localStorage.removeItem('student_refresh_token');
        window.location.href = '/';
        throw refreshError;
      }
    }
    throw error;
  }
};

// Export with auto-retry wrapper for authenticated endpoints
export const secureAPI = {
  courseAPI: {
    getUserCourses: (userId) => apiWithTokenRefresh(() => courseAPI.getUserCourses(userId)),
    getAllCourses: () => apiWithTokenRefresh(() => courseAPI.getAllCourses()),
    enroll: (userId, courseId, options = {}) =>
      apiWithTokenRefresh(() => courseAPI.enroll(userId, courseId, options)),
    createPromptPayIntent: (userId, courseId, options = {}) =>
      apiWithTokenRefresh(() => courseAPI.createPromptPayIntent(userId, courseId, options)),
    confirmPromptPayPayment: (userId, courseId, paymentIntentId) =>
      apiWithTokenRefresh(() => courseAPI.confirmPromptPayPayment(userId, courseId, paymentIntentId)),
    getPaymentHistory: (userId) => apiWithTokenRefresh(() => courseAPI.getPaymentHistory(userId)),
    getCourseQuizzes: (userId, courseId) => apiWithTokenRefresh(() => courseAPI.getCourseQuizzes(userId, courseId)),
    getCourseLessons: (courseId, options = {}) => apiWithTokenRefresh(() => courseAPI.getCourseLessons(courseId, options)),
    getCourseLearningOverview: (courseId, options = {}) => apiWithTokenRefresh(() => courseAPI.getCourseLearningOverview(courseId, options)),
    getQuizById: (quizId, options = {}) => apiWithTokenRefresh(() => courseAPI.getQuizById(quizId, options)),
    getLessonById: (lessonId) => apiWithTokenRefresh(() => courseAPI.getLessonById(lessonId)),
    getQuizzesByCourse: (courseId, options = {}) => apiWithTokenRefresh(() => courseAPI.getQuizzesByCourse(courseId, options)),
    getUserQuizzes: (userId, limit) => apiWithTokenRefresh(() => courseAPI.getUserQuizzes(userId, limit)),
    getUserQuizResults: (userId, options = {}) => apiWithTokenRefresh(() => courseAPI.getUserQuizResults(userId, options)),
    submitQuizAnswers: (userId, quizId, answers) => apiWithTokenRefresh(() => courseAPI.submitQuizAnswers(userId, quizId, answers)),
    getQuizResults: (userId, quizId) => apiWithTokenRefresh(() => courseAPI.getQuizResults(userId, quizId)),
    getCourseMockExamLeaderboard: (courseId, limit = 50) =>
      apiWithTokenRefresh(() => courseAPI.getCourseMockExamLeaderboard(courseId, limit)),
    recordLearningActivity: (userId, payload = {}) =>
      apiWithTokenRefresh(() => courseAPI.recordLearningActivity(userId, payload)),
    getStudentAnalysisSummary: (userId, courseId, payload = {}) =>
      apiWithTokenRefresh(() => courseAPI.getStudentAnalysisSummary(userId, courseId, payload))
  },
  chatAPI: {
    sendMessage: (message, userId, courseId, conversationId, questionContext, imageFile, chatMode) =>
      apiWithTokenRefresh(() => chatAPI.sendMessage(message, userId, courseId, conversationId, questionContext, imageFile, chatMode)),
    getEnergyStatus: (userId) => apiWithTokenRefresh(() => chatAPI.getEnergyStatus(userId))
  }
};

export default {
  authAPI,
  courseAPI,
  chatAPI,
  secureAPI
};
