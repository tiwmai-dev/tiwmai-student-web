import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Camera, Paperclip, PenLine } from 'lucide-react';
import { secureAPI } from '../utils/api';
import { extractQuestionContextText } from '../utils/questionContext';
import MathText from './MathText';

const getContextKey = (ctx) => {
  if (!ctx) return null;
  if (typeof ctx === 'string') return ctx.trim();
  const key = ctx.question_id || ctx.questionId || ctx.question_text || ctx.question || null;
  return typeof key === 'string' ? key.trim() : String(key);
};

const getSharedQuestionContext = (ctx) => {
  if (!ctx) return '';
  return extractQuestionContextText(ctx);
};

const parseChatTimestamp = (value) => {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
    const parsed = new Date(hasTimezone ? trimmed : `${trimmed}Z`);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const buildWelcomeMessage = ({ course, user, chatMode }) => {
  const userName = user?.name || user?.username || user?.studentId || 'นักเรียน';
  const courseName = course?.name || 'คอร์สเรียน';
  const isLearningAdvisor = chatMode === 'learning_advisor';

  return isLearningAdvisor
    ? `สวัสดีค่ะ ${userName} 👋\n\nน้องติวช่วยสรุปและตอบคำถามเกี่ยวกับผลการเรียนของคุณจากข้อมูลในระบบได้นะคะ\n\nคุณสามารถถามได้ เช่น\n- ตอนนี้ความคืบหน้าเป็นอย่างไร\n- คะแนนเฉลี่ยล่าสุดเท่าไร\n- วิชาหรือหัวข้อไหนควรโฟกัสก่อน\n\nเริ่มได้เลยด้วยคำถามสั้น ๆ ที่คุณอยากรู้ค่ะ`
    : `สวัสดีค่ะ ${userName} 👋\n\nยินดีต้อนรับสู่คอร์ส "${courseName}"\nน้องติวพร้อมช่วยให้คุณเรียนเข้าใจขึ้นนะคะ\n\nน้องติวช่วยคุณได้ในเรื่องต่อไปนี้\n- ตอบคำถามจากเนื้อหาในคอร์ส\n- อธิบายแนวคิดที่ซับซ้อนให้เข้าใจง่าย\n\nพิมพ์คำถามได้เลย เช่น "ช่วยอธิบายข้อนี้แบบทีละขั้นตอน"`;
};

const buildQuestionContextAnnouncement = (ctx) => {
  const sharedContext = getSharedQuestionContext(ctx);
  if (!sharedContext) return null;

  const questionText = typeof ctx === 'object'
    ? String(ctx?.question_text || ctx?.question || '').trim()
    : '';

  const lines = [sharedContext];
  if (questionText) {
    lines.push('', `โจทย์: ${questionText}`);
  }
  return lines.join('\n');
};

const ChatInterface = forwardRef(({
  course,
  user,
  context = null,
  onSuggestionSelect,
  onAiResponse,
  chatMode = 'study_solver',
  allowAttachments = true,
  showEnergyBanner = false,
  onEnergyChange = null
}, ref) => {
  const [messages, setMessages] = useState(() => {
    return [
      {
        id: 1,
        type: 'ai',
        content: buildWelcomeMessage({ course, user, chatMode }),
        timestamp: new Date()
      }
    ];
  });
  
  const [inputMessage, setInputMessage] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [imageError, setImageError] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [chatEnergy, setChatEnergy] = useState(null);
  const [energyLoading, setEnergyLoading] = useState(false);
  const [showDrawModal, setShowDrawModal] = useState(false);
  const [brushSize, setBrushSize] = useState(4);
  const [brushColor, setBrushColor] = useState('#0f172a');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const drawCanvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef({ x: 0, y: 0 });
  const lastContextKeyRef = useRef(null);
  const lastContextAnnouncementRef = useRef(null);
  const isSendingRef = useRef(false);
  const consumedSuggestionKeysRef = useRef(new Set());

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const resolveUserId = () => {
    const id = user?.id || user?.user_id || user?.studentId || user?.username || '';
    return String(id || '').trim();
  };

  const resolveEnergyStatus = (payload, fallbackUserId = '') => {
    if (!payload || typeof payload !== 'object') return null;
    const asNumber = (value, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const dailyLimit = payload.daily_limit_thb ?? payload.chat_energy_limit_thb;
    const usedThb = payload.used_thb ?? payload.chat_energy_used_thb;
    const remainingThb = payload.remaining_thb ?? payload.chat_energy_remaining_thb;
    const remainingPercent = payload.remaining_percent ?? payload.chat_energy_percent;
    const hasEnergyFields = (
      dailyLimit !== undefined
      || usedThb !== undefined
      || remainingThb !== undefined
      || remainingPercent !== undefined
      || payload.is_exhausted !== undefined
      || payload.chat_energy_exhausted !== undefined
    );
    if (!hasEnergyFields) return null;

    const normalizedDailyLimit = Math.max(0, asNumber(dailyLimit, 0));
    const normalizedUsed = Math.max(0, asNumber(usedThb, 0));
    const normalizedRemaining = Math.max(0, asNumber(remainingThb, 0));
    const percentFromUsage = normalizedDailyLimit > 0
      ? (normalizedRemaining / normalizedDailyLimit) * 100
      : 0;
    const normalizedPercent = Math.max(
      0,
      Math.min(100, asNumber(remainingPercent, percentFromUsage))
    );
    const exhausted = (
      payload.is_exhausted !== undefined
        ? Boolean(payload.is_exhausted)
        : (
          payload.chat_energy_exhausted !== undefined
            ? Boolean(payload.chat_energy_exhausted)
            : normalizedRemaining <= 0.000001
        )
    );

    return {
      user_id: String(payload.user_id || fallbackUserId || '').trim() || null,
      daily_limit_thb: Number(normalizedDailyLimit.toFixed(4)),
      used_thb: Number(normalizedUsed.toFixed(4)),
      remaining_thb: Number(normalizedRemaining.toFixed(4)),
      remaining_percent: Number(normalizedPercent.toFixed(2)),
      is_exhausted: exhausted,
      usage_date: String(payload.usage_date || '').trim() || null,
    };
  };

  const pushEnergyUpdate = (payload, fallbackUserId = '') => {
    const normalized = resolveEnergyStatus(payload, fallbackUserId);
    if (!normalized) return null;
    setChatEnergy(normalized);
    setEnergyLoading(false);
    if (typeof onEnergyChange === 'function') {
      try {
        onEnergyChange(normalized);
      } catch (_) {}
    }
    try {
      window.dispatchEvent(
        new CustomEvent('student-chat-energy-updated', {
          detail: normalized,
        })
      );
    } catch (_) {}
    return normalized;
  };

  const userId = resolveUserId();
  const chatEnergyExhausted = Boolean(chatEnergy?.is_exhausted);
  const chatEnergyPercent = Math.max(
    0,
    Math.min(100, Number(chatEnergy?.remaining_percent || 0))
  );

  useEffect(() => {
    if (!userId) {
      setChatEnergy(null);
      setEnergyLoading(false);
      return;
    }
    let isMounted = true;
    let isFirstLoad = true;

    const loadEnergyStatus = async () => {
      try {
        if (isFirstLoad) {
          setEnergyLoading(true);
        }
        const status = await secureAPI.chatAPI.getEnergyStatus(userId);
        if (!isMounted) return;
        pushEnergyUpdate(status, userId);
      } catch (error) {
        if (!isMounted) return;
        console.warn('Load chat energy status failed:', error);
      } finally {
        if (isMounted) {
          setEnergyLoading(false);
        }
        isFirstLoad = false;
      }
    };

    loadEnergyStatus();
    const intervalId = window.setInterval(loadEnergyStatus, 60000);
    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    const handleEnergyUpdate = (event) => {
      const detail = event?.detail;
      const normalized = resolveEnergyStatus(detail, userId);
      if (!normalized) return;
      const detailUserId = String(normalized.user_id || '').trim();
      if (detailUserId && detailUserId !== userId) return;
      setChatEnergy(normalized);
      setEnergyLoading(false);
    };
    window.addEventListener('student-chat-energy-updated', handleEnergyUpdate);
    return () => window.removeEventListener('student-chat-energy-updated', handleEnergyUpdate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Reset conversation only when question identity changes (not every metadata update)
  useEffect(() => {
    const currentKey = getContextKey(context);
    if (currentKey && currentKey !== lastContextKeyRef.current) {
      setConversationId(null);
      lastContextKeyRef.current = currentKey;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context]);

  useEffect(() => {
    if (chatMode === 'learning_advisor') return;

    const currentKey = getContextKey(context);
    const sharedContext = getSharedQuestionContext(context);
    const announcementKey = `${currentKey || ''}::${sharedContext}`;
    if (announcementKey === lastContextAnnouncementRef.current) {
      return;
    }
    lastContextAnnouncementRef.current = announcementKey;

    setMessages((prev) => {
      const withoutContextMessage = prev.filter((message) => !message?.metadata?.systemQuestionContext);
      const announcement = buildQuestionContextAnnouncement(context);
      if (!announcement) {
        return withoutContextMessage;
      }

      return [
        ...withoutContextMessage,
        {
          id: `question-context-${Date.now()}`,
          type: 'ai',
          content: announcement,
          timestamp: new Date(),
          metadata: {
            systemQuestionContext: true,
            questionKey: currentKey || null,
          },
        }
      ];
    });
  }, [context, chatMode]);

  const MAX_IMAGE_DIMENSION = 1280;
  const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
  const MAX_RAW_IMAGE_SIZE_BYTES = 12 * 1024 * 1024;
  const LOSSY_IMAGE_QUALITY = 0.86;

  const resizeImageIfNeeded = async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      return file;
    }

    let objectUrl = '';
    try {
      const image = await new Promise((resolve, reject) => {
        objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'));
        img.src = objectUrl;
      });

      const sourceWidth = Number(image.naturalWidth || image.width || 0);
      const sourceHeight = Number(image.naturalHeight || image.height || 0);
      const longestEdge = Math.max(sourceWidth, sourceHeight);
      if (!Number.isFinite(longestEdge) || longestEdge <= MAX_IMAGE_DIMENSION) {
        return file;
      }

      const scale = MAX_IMAGE_DIMENSION / longestEdge;
      const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
      const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return file;
      }
      ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

      const outputType = file.type || 'image/jpeg';
      const resizedBlob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
              return;
            }
            reject(new Error('IMAGE_RESIZE_FAILED'));
          },
          outputType,
          outputType === 'image/png' ? undefined : LOSSY_IMAGE_QUALITY
        );
      });

      return new File([resizedBlob], file.name, {
        type: resizedBlob.type || outputType,
      });
    } catch (error) {
      console.warn('Image resize skipped:', error);
      return file;
    } finally {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    }
  };

  const handleSendMessage = async (e, messageText = null, options = {}) => {
    if (e) e.preventDefault();
    if (isSendingRef.current) return;
    const {
      hideUserBubble = false,
      imageFileOverride = null,
      imagePreviewUrlOverride = null,
      imageNameOverride = null
    } = options;
    
    const rawText = messageText !== null ? messageText : inputMessage.trim();
    const hasImage = allowAttachments && Boolean(imageFileOverride || selectedImage?.file);
    const imageFileToSend = allowAttachments ? (imageFileOverride || selectedImage?.file || null) : null;
    const hasQuestionContext = Boolean(
      (typeof context === 'string' && context.trim())
      || (context && typeof context === 'object' && (context.question_text || context.question || context.question_id || context.questionId))
    );
    const revealAfterMethodImage = Boolean(
      hasImage
      && context
      && typeof context === 'object'
      && context.answer_submitted_for_question
      && context.is_user_answer_correct === false
      && context.allow_retry_after_ai_response !== true
      && (
        context.question_confidence === 'confident'
        || context.question_confidence === 'not_confident'
      )
    );
    const allowDirectAnswer = Boolean(
      context
      && typeof context === 'object'
      && (
        context.allow_direct_answer
        || context.quiz_submitted
        || context.answer_revealed_for_question
        || revealAfterMethodImage
      )
    );
    const autoImagePrompt = hasQuestionContext
      ? (
        allowDirectAnswer
          ? 'นี่คือวิธีทำของนักเรียนจากโจทย์ในบริบท กรุณาตอบเป็น 3 ส่วนสั้น ๆ คือ สิ่งที่ทำถูก, จุดที่ควรแก้, และคำตอบที่ถูกต้อง พร้อมเหตุผลแบบอ่านง่าย'
          : 'นี่คือวิธีทำของนักเรียนจากโจทย์ในบริบท กรุณาช่วยโค้ชแบบชวนคิดทีละขั้น ชี้จุดที่ควรแก้และแนวทางคิดต่อ โดยยังไม่เฉลยคำตอบสุดท้ายหรือตัวเลือกที่ถูกตรงๆ และให้ตอบเป็นข้อสั้น ๆ พร้อมคำถามนำท้าย'
      )
      : 'ช่วยอธิบายภาพที่แนบมา';
    const textToSend = rawText || (hasImage ? autoImagePrompt : '');
    const displayText = rawText || (hasImage ? (hasQuestionContext ? 'ส่งวิธีทำเป็นรูปภาพ' : 'ส่งรูปภาพ') : '');
    if (!textToSend) return;
    if (chatEnergyExhausted) {
      setMessages(prev => {
        const exhaustedMessage = 'พลังงานแชทหมดแล้วสำหรับวันนี้ กรุณารอวันถัดไป หรือให้แอดมินเพิ่มพลังงานก่อนใช้งานต่อ';
        const lastMessage = prev[prev.length - 1];
        if (lastMessage?.type === 'ai' && String(lastMessage?.content || '').includes('พลังงานแชทหมดแล้ว')) {
          return prev;
        }
        return [...prev, {
          id: Date.now() + 1,
          type: 'ai',
          content: exhaustedMessage,
          timestamp: new Date(),
          metadata: { energyExhausted: true }
        }];
      });
      return;
    }

    isSendingRef.current = true;

    if (!hideUserBubble) {
      const userMessage = {
        id: Date.now(),
        type: 'user',
        content: displayText,
        timestamp: new Date(),
        attachments: hasImage
          ? [{
            type: 'image',
            url: imagePreviewUrlOverride || selectedImage?.previewUrl || '',
            name: imageNameOverride || selectedImage?.name || 'attachment.png'
          }]
          : null
      };
      setMessages(prev => [...prev, userMessage]);
    }
    setInputMessage('');
    setSelectedImage(null);
    setImageError(null);
    setIsTyping(true);

    try {
      // Clear any previous API errors
      setApiError(null);
      
      // Call real API endpoint using our secure API wrapper
      const effectiveContext = context && typeof context === 'object'
        ? {
          ...context,
          ...(revealAfterMethodImage
            ? {
              allow_direct_answer: true,
              reveal_solution_after_method: true,
            }
            : {}),
        }
        : (context || null);
      
      const response = await secureAPI.chatAPI.sendMessage(
        textToSend,
        user?.id || user?.user_id || user?.studentId || user?.username || 'anonymous',
        course?.id,
        conversationId,
        effectiveContext,
        imageFileToSend,
        chatMode
      );
      pushEnergyUpdate(response, userId);

      if (response.conversation_id && !conversationId) {
        setConversationId(response.conversation_id);
      }

      setMessages(prev => [...prev, {
        id: response.message_id || Date.now() + 1,
        type: 'ai',
        content: response.content || response.response || response.message || 'ขออภัย ไม่สามารถรับข้อความตอบกลับได้',
        timestamp: parseChatTimestamp(response.timestamp),
        metadata: {
          confidence: response.confidence,
          processing_time_ms: response.processing_time_ms,
          conversation_id: response.conversation_id
        }
      }]);

      if (typeof onAiResponse === 'function') {
        try {
          const contextQuestionId = context?.question_id || context?.questionId || null;
          onAiResponse({
            questionId: contextQuestionId,
            hideUserBubble,
            hadImage: hasImage,
            userText: textToSend
          });
        } catch (_) {}
      }
    } catch (error) {
      console.error('Chat API error:', error);
      setApiError(error.message);
      
      // Provide a helpful error message instead of mock response
      const fallbackErrorMessage = `ขออภัยค่ะ ระบบ AI ไม่สามารถเชื่อมต่อได้ในขณะนี้ 🤖\n\n**สาเหตุที่เป็นไปได้:**\n• การเชื่อมต่อเครือข่ายมีปัญหา\n• เซิร์ฟเวอร์ AI กำลังบำรุงรักษา\n• คีย์ API ไม่ถูกต้อง\n\n**กรุณาลองใหม่ในอีกสักครู่** หรือติดต่อผู้ดูแลระบบหากปัญหายังคงอยู่\n\n*รายละเอียดข้อผิดพลาด: ${error.message}*`;
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        type: 'ai',
        content: fallbackErrorMessage,
        timestamp: new Date(),
        metadata: { error: true, errorDetails: error.message }
      }]);
    } finally {
      setIsTyping(false);
      isSendingRef.current = false;
    }
  };

  const handleAttachmentClick = () => {
    if (chatEnergyExhausted) return;
    fileInputRef.current?.click();
  };

  const handleCameraClick = () => {
    if (chatEnergyExhausted) return;
    cameraInputRef.current?.click();
  };

  const processImageFile = async (file) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setImageError('รองรับเฉพาะไฟล์รูปภาพเท่านั้น');
      return;
    }

    if (file.size > MAX_RAW_IMAGE_SIZE_BYTES) {
      setImageError('ไฟล์รูปภาพใหญ่เกินไป (สูงสุด 12MB ก่อนย่อ)');
      return;
    }

    const preparedFile = await resizeImageIfNeeded(file);
    if (preparedFile.size > MAX_IMAGE_SIZE_BYTES) {
      setImageError('ไฟล์รูปภาพหลังย่อยังเกิน 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImage({
        file: preparedFile,
        name: preparedFile.name,
        previewUrl: reader.result
      });
      setImageError(null);
    };
    reader.onerror = () => {
      setImageError('ไม่สามารถอ่านไฟล์รูปภาพได้');
    };
    reader.readAsDataURL(preparedFile);
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    void processImageFile(file);

    // Reset input so the same file can be selected again if needed
    e.target.value = '';
  };

  const resizeDrawCanvas = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * ratio);
    canvas.height = Math.floor(rect.height * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  useEffect(() => {
    if (!showDrawModal) return;
    resizeDrawCanvas();
    const onResize = () => resizeDrawCanvas();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [showDrawModal]);

  const getCanvasPoint = (e) => {
    const canvas = drawCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    isDrawingRef.current = true;
    const point = getCanvasPoint(e);
    lastPointRef.current = point;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  };

  const draw = (e) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const point = getCanvasPoint(e);
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = brushSize;
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
  };

  const stopDrawing = (e) => {
    if (e) e.preventDefault();
    isDrawingRef.current = false;
  };

  const clearDrawing = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
  };

  const saveDrawingAsImage = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `handwriting-${Date.now()}.png`, { type: 'image/png' });
      void processImageFile(file);
      setShowDrawModal(false);
    }, 'image/png');
  };

  const sendDrawingAnswer = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas || isTyping || chatEnergyExhausted) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const rawFile = new File([blob], `handwriting-${Date.now()}.png`, { type: 'image/png' });
      const file = await resizeImageIfNeeded(rawFile);
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        setImageError('ไฟล์รูปภาพหลังย่อยังเกิน 5MB');
        return;
      }
      const previewUrl = URL.createObjectURL(file);
      setShowDrawModal(false);
      handleSendMessage(null, '', {
        imageFileOverride: file,
        imagePreviewUrlOverride: previewUrl,
        imageNameOverride: file.name
      }).finally(() => {
        setTimeout(() => URL.revokeObjectURL(previewUrl), 60_000);
      });
    }, 'image/png');
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setImageError(null);
  };

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    sendMessage: (text) => handleSendMessage(null, text),
    addAiMessage: ({ content, suggestions = [] }) => {
      setMessages(prev => [...prev, {
        id: Date.now(),
        type: 'ai',
        content: content || '',
        timestamp: new Date(),
        suggestions
      }]);
    }
  }));

  // COMMENTED OUT - Now using only real backend API responses
  // const generateFallbackResponse = () => {
  //   const fallbackResponses = [
  //     "ขออภัยค่ะ ระบบมีปัญหาชั่วคราว กรุณาลองใหม่อีกครั้งในสักครู่นะคะ 🙏",
  //     "ขอโทษด้วยค่ะ ตอนนี้การเชื่อมต่อไม่เสถียร ลองถามใหม่อีกครั้งได้ไหมคะ",
  //     "เกิดข้อผิดพลาดเล็กน้อยค่ะ ฉันจะพยายามตอบคำถามของคุณให้ดีที่สุดในครั้งหน้า ❤️"
  //   ];
  //   return fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
  // };

  // COMMENTED OUT - Mock responses replaced with real backend API
  // const generateAIResponse = (userInput, course) => {
  //   const input = userInput.toLowerCase();
  //   // Mock response logic here...
  //   return "Mock response (now using real backend API)";
  // };

  const formatMessage = (content) => {
    // Handle null/undefined content
    if (content === null || content === undefined || content === 'undefined') {
      return (
        <div style={{ 
          color: '#ef4444', 
          fontStyle: 'italic', 
          background: '#fef2f2', 
          padding: '0.5rem', 
          borderRadius: '0.375rem',
          border: '1px solid #fecaca'
        }}>
          ⚠️ ขออภัย เกิดข้อผิดพลาดในการแสดงข้อความ กรุณาลองใหม่อีกครั้ง
        </div>
      );
    }

    // Convert content to string if it's not already
    const contentString = typeof content === 'string' ? content : String(content);
    const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hasMarkdownStructure = (value) => (
      /(^|\n)\s*([-*+]|#{1,6}|\d+\.)\s+/.test(value)
      || /(^|\n)\s*>/.test(value)
      || /```/.test(value)
    );
    const summaryToMarkdown = (value) => {
      let line = String(value || '').trim().replace(/^ดังนั้น\s*/, '');
      let match = line.match(/^คำตอบที่ถูกต้อง(?:คือ|:)\s*(.+)$/);
      if (match) return `**คำตอบที่ถูกต้อง:** ${match[1].trim()}`;
      match = line.match(/^คำตอบ(?:คือ|:)\s*(.+)$/);
      if (match) return `**คำตอบ:** ${match[1].trim()}`;
      match = line.match(/^ตอบ(?:คือ|:)?\s*(.+)$/);
      if (match) return `**ตอบ:** ${match[1].trim()}`;
      match = line.match(/^สรุป(?:ว่า|:)?\s*(.+)$/);
      if (match) return `**สรุป:** ${match[1].trim()}`;
      return `**สรุป:** ${line}`;
    };
    const autoFormatDenseExplanation = (value) => {
      const raw = String(value || '').trim();
      if (!raw || hasMarkdownStructure(raw) || raw.length < 90) {
        return raw;
      }

      const transitionPhrases = [
        'คำตอบที่ถูกต้องคือ',
        'คำตอบคือ',
        'ดังนั้น',
        'จากนั้น',
        'ต่อมา',
        'แล้วนำ',
        'แล้วค่อย',
        'เมื่อจ่าย',
        'เมื่อนำ',
        'เมื่อรวม',
        'สรุป',
        'แต่',
      ];
      const transitionPattern = new RegExp(
        `([^\\n])\\s*(${transitionPhrases.map(escapeRegExp).join('|')})`,
        'g'
      );

      let structured = raw
        .replace(/(ครับ|ค่ะ|คะ|บาท|คะแนน|ข้อ|ชั่วโมง|นาที)\s+(แต่|จากนั้น|ต่อมา|แล้วนำ|แล้วค่อย|เมื่อจ่าย|เมื่อนำ|เมื่อรวม|ดังนั้น|สรุป|คำตอบที่ถูกต้องคือ|คำตอบคือ)/g, '$1\n$2')
        .replace(transitionPattern, '$1\n$2')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      let lines = structured
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.replace(/^และ\s+/, '').trim());

      if (lines.length < 3) {
        return structured;
      }

      const introLines = [];
      const bulletLines = [];
      const outroLines = [];
      const introPattern = /^(วิธีที่คุณ|วิธีคิด|จากโจทย์นี้|แนวคิดคือ|เริ่มจาก|ลองดู|ถูกต้องแล้ว|เรามาดู)/;
      const bulletLeadPattern = /^(แต่|จากนั้น|ต่อมา|แล้วนำ|แล้วค่อย|เมื่อจ่าย|เมื่อนำ|เมื่อรวม|นำ|รวม|ตรวจสอบ|เปรียบเทียบ|แยก|จัดรูป|เทียบ|ลองแทน|จะได้รับเงินทอน)/;

      lines.forEach((line, index) => {
        if (!line) return;
        if (/^(ดังนั้น|สรุป|คำตอบที่ถูกต้องคือ|คำตอบคือ|ตอบ)/.test(line)) {
          outroLines.push(summaryToMarkdown(line));
          return;
        }

        if (index === 0 && introPattern.test(line)) {
          introLines.push(line);
          return;
        }

        if (bulletLeadPattern.test(line)) {
          bulletLines.push(`- ${line}`);
          return;
        }

        if (index === 0 && introLines.length === 0) {
          introLines.push(line);
          return;
        }

        bulletLines.push(`- ${line}`);
      });

      if (bulletLines.length < 2) {
        return structured;
      }

      const sections = [];
      if (introLines.length > 0) {
        sections.push(introLines.join(' '));
      }
      sections.push(bulletLines.join('\n'));
      if (outroLines.length > 0) {
        sections.push(outroLines.join('\n\n'));
      }
      return sections.join('\n\n').trim();
    };
    const normalizeChatMarkdown = (value) => {
      let text = String(value || '').replace(/\r\n/g, '\n');
      // Recover double-escaped control characters (e.g. "\\n") but avoid LaTeX commands.
      for (let i = 0; i < 2; i += 1) {
        const before = text;
        text = text
          .replace(/\\\\r\\\\n(?![a-zA-Z])/g, '\n')
          .replace(/\\\\n(?![a-zA-Z])/g, '\n')
          .replace(/\\\\r(?![a-zA-Z])/g, '\n')
          .replace(/\\\\t(?![a-zA-Z])/g, '  ')
          .replace(/\\\\"/g, '"')
          .replace(/\\\\'/g, "'");
        if (text === before) break;
      }
      // Convert escaped control chars from backend/model output into readable text.
      text = text.replace(/\\n(?![a-zA-Z])/g, '\n');
      text = text.replace(/\\r(?![a-zA-Z])/g, '\n');
      text = text.replace(/\\t(?![a-zA-Z])/g, '  ');
      text = text.replace(/\\"/g, '"');
      text = text.replace(/\\'/g, "'");
      text = text.replace(/\\\//g, '/');
      // Normalize escaped bullet markers from backend/model output before generic slash cleanup.
      text = text.replace(/\s*\\+\s*([•◦▪●])\s*/g, '\n$1 ');
      text = text.replace(/\s*\/+\s*([•◦▪●])\s*/g, '\n$1 ');
      // Remove stray "\" before Thai chars or non-command symbols.
      text = text.replace(/\\(?=[\u0E00-\u0E7F])/g, '');
      text = text.replace(/\\(?![a-zA-Z\\$()[\]{}])/g, '');
      // Catch any remaining escaped bullets that survived earlier normalization.
      text = text.replace(/\s*\\\s*([•◦▪●])\s*/g, '\n$1 ');
      text = text.replace(/\/\s*([•◦▪●])\s*/g, '\n$1 ');
      // Remove noisy standalone "\" lines from escaped markdown artifacts.
      text = text.replace(/^\s*\\\s*$/gm, '');
      // Remove stray trailing slashes that leak from malformed escaped payloads.
      text = text.replace(/\\+(?=\s*$)/gm, '');
      // Ensure headings/list markers start on a new line even if model returns them glued.
      text = text.replace(/\s*(\/?#{1,6}\s+)/g, '\n\n$1');
      text = text.replace(/([^\n*_`])\s*(\d+\.\s+)/g, '$1\n$2');
      text = text.replace(/([^\n*_`])\s*([•◦▪●]\s+)/g, '$1\n$2');
      // Avoid compacted separators like "### ... /### ...".
      text = text.replace(/\/\s*(#{1,6}\s+)/g, '\n\n$1');

      text = text
        .split(/\n{2,}/)
        .map((block) => autoFormatDenseExplanation(block))
        .join('\n\n');

      // Cleanup excessive line breaks.
      text = text.replace(/\n{3,}/g, '\n\n').trim();
      return text;
    };
    const normalizedContent = normalizeChatMarkdown(contentString);

    const renderInlineMathChildren = (children) => (
      React.Children.map(children, (child, index) => {
        if (typeof child === 'string') {
          return <MathText key={`math-${index}`} text={child} inline />;
        }
        return child;
      })
    );

    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ node, children, ...props }) => (
            <p style={{ marginBottom: '0.75rem', whiteSpace: 'pre-wrap' }} {...props}>
              {renderInlineMathChildren(children)}
            </p>
          ),
          ul: ({ node, ...props }) => <ul style={{ marginLeft: '1.1rem', marginBottom: '0.75rem' }} {...props} />,
          ol: ({ node, ...props }) => <ol style={{ marginLeft: '1.1rem', marginBottom: '0.75rem' }} {...props} />,
          li: ({ node, children, ...props }) => (
            <li style={{ marginBottom: '0.35rem' }} {...props}>
              {renderInlineMathChildren(children)}
            </li>
          ),
          h1: ({ node, children, ...props }) => (
            <h1 style={{ fontSize: '1em', fontWeight: '650', marginBottom: '0.55rem' }} {...props}>
              {renderInlineMathChildren(children)}
            </h1>
          ),
          h2: ({ node, children, ...props }) => (
            <h2 style={{ fontSize: '1em', fontWeight: '650', marginBottom: '0.5rem' }} {...props}>
              {renderInlineMathChildren(children)}
            </h2>
          ),
          h3: ({ node, children, ...props }) => (
            <h3 style={{ fontSize: '1em', fontWeight: '650', marginBottom: '0.45rem' }} {...props}>
              {renderInlineMathChildren(children)}
            </h3>
          ),
          code: ({ node, inline, ...props }) =>
            inline
              ? <code style={{ background: '#e8eef5', padding: '0.15rem 0.32rem', borderRadius: '0.25rem', fontSize: '1em', color: '#0f172a' }} {...props} />
              : <code style={{ background: '#e2e8f0', padding: '0.6rem', borderRadius: '0.4rem', display: 'block', fontSize: '1em', color: '#0f172a', border: '1px solid #cbd5e1' }} {...props} />,
          blockquote: ({ node, children, ...props }) => (
            <blockquote style={{ borderLeft: '4px solid #67e8f9', paddingLeft: '1rem', margin: '0.6rem 0', opacity: '0.9' }} {...props}>
              {renderInlineMathChildren(children)}
            </blockquote>
          ),
          strong: ({ node, children, ...props }) => <strong style={{ fontWeight: '600' }} {...props}>{renderInlineMathChildren(children)}</strong>,
          em: ({ node, children, ...props }) => <em style={{ fontStyle: 'italic' }} {...props}>{renderInlineMathChildren(children)}</em>,
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
    );
  };

  return (
    <div className="chat-interface">
      {apiError && (
        <div className="chat-error-banner">
          <span className="error-icon">⚠️</span>
          <span>การเชื่อมต่อมีปัญหา กำลังใช้โหมดออฟไลน์ชั่วคราว</span>
          <button 
            className="retry-button" 
            onClick={() => setApiError(null)}
            title="ลองเชื่อมต่อใหม่"
          >
            🔄
          </button>
        </div>
      )}
      <div className="chat-messages">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`message ${message.type} ${message.metadata?.systemQuestionContext ? 'context-message' : ''}`}
          >
            <div className="message-avatar">
              {message.type === 'ai' ? 'AI' : 'T'}
            </div>
            <div className={`message-content ${message.metadata?.systemQuestionContext ? 'context-content' : ''}`}>
              <div
                className={`message-bubble ${message.metadata?.error ? 'error' : ''} ${message.metadata?.systemQuestionContext ? 'context-bubble' : ''}`}
              >
                {formatMessage(message.content)}
                {Array.isArray(message.attachments) && message.attachments.length > 0 && (
                  <div className="message-attachments">
                    {message.attachments.map((attachment, index) => (
                      <img
                        key={`${message.id}-att-${index}`}
                        className="message-attachment-image"
                        src={attachment.url}
                        alt={attachment.name || 'แนบรูปภาพ'}
                      />
                    ))}
                  </div>
                )}
                {message.type === 'ai' && Array.isArray(message.suggestions) && message.suggestions.length > 0 && (
                  <div className="suggested-replies">
                    {message.suggestions.map((suggestion) => (
                      <button
                        key={suggestion.id}
                        type="button"
                        className="suggested-reply"
                        disabled={isTyping || consumedSuggestionKeysRef.current.has(`${message.id}:${suggestion.id || suggestion.label || ''}`)}
                        onClick={() => {
                          const suggestionKey = `${message.id}:${suggestion.id || suggestion.label || ''}`;
                          if (isTyping || consumedSuggestionKeysRef.current.has(suggestionKey)) return;

                          consumedSuggestionKeysRef.current.add(suggestionKey);
                          setMessages(prev => prev.map((item) => {
                            if (item.id !== message.id) return item;
                            return {
                              ...item,
                              suggestions: []
                            };
                          }));

                          const label = suggestion.label || '';
                          if (label) {
                            setMessages(prev => [...prev, {
                              id: Date.now() + 1,
                              type: 'user',
                              content: label,
                              timestamp: new Date()
                            }]);
                          }
                          if (typeof onSuggestionSelect === 'function') {
                            onSuggestionSelect(suggestion.payload || {});
                          }
                        }}
                      >
                        {suggestion.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="message-time">
                {message.timestamp.toLocaleTimeString('th-TH', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            </div>
          </div>
        ))}
        
        {isTyping && (
          <div className="message ai">
            <div className="message-avatar">AI</div>
            <div className="message-content">
              <div className="message-bubble typing">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                กำลังพิมพ์...
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <div className="floating-input-container">
        {showEnergyBanner && chatEnergy && (
          <div className={`chat-energy-banner ${chatEnergyExhausted ? 'exhausted' : ''}`}>
            <div className="chat-energy-banner-label">✨ AI</div>
            <div className="chat-energy-banner-meter">
              <div className="chat-energy-banner-track">
                <span style={{ width: `${chatEnergyPercent}%` }} />
              </div>
              <div className="chat-energy-banner-percent">
                {chatEnergyExhausted ? 'หมด' : `${Math.round(chatEnergyPercent)}%`}
              </div>
            </div>
          </div>
        )}
        <form onSubmit={handleSendMessage} className="floating-chat-input">
          {allowAttachments && selectedImage && (
            <div className="chat-attachment-preview">
              <img src={selectedImage.previewUrl} alt={selectedImage.name} />
              <span className="chat-attachment-name">{selectedImage.name}</span>
              <button
                type="button"
                className="chat-attachment-remove"
                onClick={handleRemoveImage}
                aria-label="ลบรูปภาพที่แนบ"
              >
                ✕
              </button>
            </div>
          )}
          {allowAttachments && imageError && (
            <div className="chat-attachment-error">{imageError}</div>
          )}
          <div className="floating-input-wrapper">
            <input
              ref={inputRef}
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={chatEnergyExhausted ? 'พลังงานแชทหมดแล้วสำหรับวันนี้' : 'พิมพ์ข้อความที่นี่...'}
              disabled={isTyping || chatEnergyExhausted}
              className="floating-input"
            />
            <div className="input-actions">
              {allowAttachments ? (
                <>
                  <button 
                    type="button"
                    className="attachment-button"
                    title="แนบไฟล์"
                    onClick={handleAttachmentClick}
                    disabled={chatEnergyExhausted || isTyping}
                  >
                    <Paperclip size={18} strokeWidth={2} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="attachment-button camera-button"
                    title="ถ่ายรูป"
                    onClick={handleCameraClick}
                    disabled={chatEnergyExhausted || isTyping}
                  >
                    <Camera size={18} strokeWidth={2} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="attachment-button draw-button"
                    title="เขียน/วาด"
                    onClick={() => setShowDrawModal(true)}
                    disabled={chatEnergyExhausted || isTyping}
                  >
                    <PenLine size={18} strokeWidth={2} aria-hidden="true" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    style={{ display: 'none' }}
                  />
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleImageChange}
                    style={{ display: 'none' }}
                  />
                </>
              ) : null}
              <button 
                type="submit" 
                disabled={(!inputMessage.trim() && !(allowAttachments && selectedImage)) || isTyping || chatEnergyExhausted}
                className={`floating-send-button ${chatEnergyExhausted ? 'disabled-by-energy' : ''}`}
                title={
                  chatEnergyExhausted
                    ? 'พลังงานแชทหมดแล้ว'
                    : (isTyping ? "กำลังส่ง..." : "ส่งข้อความ")
                }
              >
                {isTyping ? (
                  <div className="sending-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22,2 15,22 11,13 2,9"></polygon>
                  </svg>
                )}
              </button>
            </div>
          </div>
          <div className="input-footer">
            <span className="input-hint">
              {chatEnergyExhausted
                ? 'พลังงานแชทหมดแล้ววันนี้'
                : (energyLoading ? 'กำลังตรวจสอบพลังงาน...' : 'Press Enter to send')}
            </span>
          </div>
        </form>
      </div>
      
      {allowAttachments && showDrawModal && (
        <div className="draw-modal-overlay" onClick={() => setShowDrawModal(false)}>
          <div className="draw-modal" onClick={(e) => e.stopPropagation()}>
            <div className="draw-modal-header">
              <h4>เขียนวิธีทำด้วยเมาส์/ปากกา</h4>
              <button type="button" className="draw-close-btn" onClick={() => setShowDrawModal(false)}>✕</button>
            </div>
            <div className="draw-toolbar">
              <label>
                สี
                <input type="color" value={brushColor} onChange={(e) => setBrushColor(e.target.value)} />
              </label>
              <label>
                ขนาดเส้น
                <input
                  type="range"
                  min="2"
                  max="14"
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                />
              </label>
              <button type="button" className="draw-tool-btn" onClick={clearDrawing}>ล้าง</button>
              <button type="button" className="draw-save-btn" onClick={saveDrawingAsImage}>แนบรูปที่เขียน</button>
              <button type="button" className="draw-submit-btn" onClick={sendDrawingAnswer} disabled={isTyping || chatEnergyExhausted}>
                ส่งคำตอบ
              </button>
            </div>
            <canvas
              ref={drawCanvasRef}
              className="draw-canvas"
              onPointerDown={startDrawing}
              onPointerMove={draw}
              onPointerUp={stopDrawing}
              onPointerLeave={stopDrawing}
              onPointerCancel={stopDrawing}
            />
          </div>
        </div>
      )}
    </div>
  );
});

export default ChatInterface;
