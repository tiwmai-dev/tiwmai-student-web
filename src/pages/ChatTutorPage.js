import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import ChatInterface from '../components/ChatInterface';
import { useAuth } from '../contexts/AuthContext';
import { trackEventOnce } from '../utils/analytics';

const ChatTutorPage = ({ user }) => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const userIdRef = useRef(user?.user_id || user?.id || user?.studentId || 'anonymous');

  useEffect(() => {
    window.scrollTo(0, 0);
    trackEventOnce('ai_tutor_opened', userIdRef.current);
  }, []);

  const handleSelectTab = (tab) => {
    if (tab === 'chat') {
      return;
    }
    if (tab === 'browse') {
      navigate('/dashboard', { state: { activeTab: 'browse' } });
      return;
    }
    if (tab === 'analysis') {
      navigate('/dashboard', { state: { activeTab: 'analysis' } });
      return;
    }
    navigate('/dashboard');
  };

  const chatUser = {
    ...user,
    id: user?.id || user?.user_id || user?.studentId || 'anonymous',
  };

  const chatCourse = {
    id: 'general-ai-tutor',
    name: 'คุยกับท่านอาจารย์',
  };

  return (
    <div className="chat-tutor-page">
      <Header
        user={user}
        onLogout={logout}
        activeTab="chat"
        onSelectTab={handleSelectTab}
      />

      <main className="chat-tutor-main">
        <div className="chat-tutor-shell">
          <section className="chat-tutor-room" aria-label="ห้องแชท">
            <div className="chat-tutor-room-header">
              <div>
                <h1>คุยกับท่านอาจารย์</h1>
                <p>ถามได้เรื่องผลการเรียน ความคืบหน้า และคะแนนจากข้อมูลในระบบ</p>
              </div>
              <button type="button" onClick={() => navigate('/dashboard')}>
                กลับหน้าหลัก
              </button>
            </div>
            <div className="chat-tutor-room-body">
              <ChatInterface
                course={chatCourse}
                user={chatUser}
                chatMode="learning_advisor"
                allowAttachments={false}
              />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default ChatTutorPage;
