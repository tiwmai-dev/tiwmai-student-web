import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  ChartColumn,
  ChevronDown,
  Home,
  Settings,
  ShoppingCart,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import logoImage from '../assets/images/logos/tewmai_logo.webp';

const AVATAR_STORAGE_KEY = 'student_avatar_preview_v1';
const AVATAR_UPDATED_EVENT = 'student-avatar-updated';

const pickFirstText = (...values) => {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
};

const getAvatarStorageKey = (user) => {
  const identity = pickFirstText(
    user?.user_id,
    user?.id,
    user?.studentId,
    user?.username,
    user?.email,
    'anonymous'
  );
  return `${AVATAR_STORAGE_KEY}:${identity}`;
};

const pickAvatarUrl = (user) => pickFirstText(
  user?.onboarding?.profile?.avatar_url,
  user?.avatar_url,
  user?.onboarding?.profile?.avatar_data_url,
  user?.avatar_data_url
);

const Header = ({
  user,
  onLogout,
  onShowAuth,
  activeTab,
  onSelectTab,
  showLandingNav = false,
  landingNavItems = [],
}) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { logout: authLogout } = useAuth();
  const headerProfileRef = useRef(null);
  const avatarStorageKey = getAvatarStorageKey(user);

  const handleAuthAction = (mode) => {
    if (typeof onShowAuth === 'function') {
      onShowAuth(mode);
      return;
    }
    navigate('/', { state: { authMode: mode } });
  };

  const handleOpenSettings = () => {
    setShowUserMenu(false);
    navigate('/dashboard', { state: { activeTab: 'settings' } });
  };

  const handleLogout = async () => {
    setShowUserMenu(false);
    try {
      if (typeof onLogout === 'function' && onLogout !== authLogout) {
        await onLogout();
      }
      if (typeof authLogout === 'function') {
        await authLogout();
      }
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  useEffect(() => {
    if (!showUserMenu) return undefined;
    const handleClickOutside = (event) => {
      if (!headerProfileRef.current?.contains(event.target)) {
        setShowUserMenu(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') setShowUserMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showUserMenu]);

  useEffect(() => {
    const profileAvatar = pickAvatarUrl(user);

    if (profileAvatar) {
      setAvatarPreview(profileAvatar);
      return undefined;
    }

    try {
      setAvatarPreview(localStorage.getItem(avatarStorageKey) || '');
    } catch (error) {
      console.warn('Failed to read local avatar preview:', error);
    }

    const handleAvatarUpdated = (event) => {
      const detail = event?.detail;
      if (detail && typeof detail === 'object') {
        if (detail.storageKey === avatarStorageKey) {
          setAvatarPreview(String(detail.avatar || ''));
        }
        return;
      }
      setAvatarPreview(String(detail || ''));
    };
    window.addEventListener(AVATAR_UPDATED_EVENT, handleAvatarUpdated);
    return () => {
      window.removeEventListener(AVATAR_UPDATED_EVENT, handleAvatarUpdated);
    };
  }, [
    avatarStorageKey,
    user,
    user?.avatar_data_url,
    user?.avatar_url,
    user?.onboarding?.profile?.avatar_data_url,
    user?.onboarding?.profile?.avatar_url,
  ]);

  const handleSelectOrNavigate = (tab) => {
    if (tab === 'chat') {
      navigate('/chat');
      return;
    }
    if (tab === 'browse') {
      navigate('/dashboard', { state: { activeTab: 'browse' } });
      return;
    }
    if (tab === 'my-courses') {
      navigate('/dashboard', { state: { activeTab: 'my-courses' } });
      return;
    }
    if (tab === 'analysis') {
      navigate('/dashboard', { state: { activeTab: 'analysis' } });
      return;
    }
    if (tab === 'courses') {
      navigate('/dashboard', { state: { activeTab: 'courses' } });
      return;
    }
    if (tab === 'settings') {
      navigate('/dashboard', { state: { activeTab: 'settings' } });
      return;
    }
    if (onSelectTab) {
      onSelectTab(tab);
      return;
    }
    navigate('/dashboard', { state: { activeTab: 'courses' } });
  };

  const navItems = [
    { key: 'courses', label: 'หน้าหลัก', icon: Home, onClick: () => handleSelectOrNavigate('courses') },
    { key: 'my-courses', label: 'คอร์สของฉัน', icon: BookOpen, onClick: () => handleSelectOrNavigate('my-courses') },
    { key: 'browse', label: 'ซื้อคอร์ส', icon: ShoppingCart, onClick: () => handleSelectOrNavigate('browse') },
    { key: 'analysis', label: 'รายงานผล', icon: ChartColumn, onClick: () => handleSelectOrNavigate('analysis') },
    { key: 'settings', label: 'ตั้งค่า', icon: Settings, onClick: () => handleSelectOrNavigate('settings') },
  ];

  const resolvedActiveTab = location.pathname === '/payment-history'
    ? 'payment-history'
    : activeTab;

  const displayName = String(user?.name || '').trim() || 'ผู้ใช้';
  const initial = displayName.charAt(0).toUpperCase();

  if (user) {
    return (
      <>
        <aside className="app-sidebar" aria-label="เมนูหลัก">
          <div className="app-sidebar-top">
            <Link to={{ pathname: '/dashboard' }} state={{ activeTab: 'courses' }} className="app-title-link">
              <h1 className="app-title">
                <img src={logoImage} alt="TEWMai" className="app-logo" />
              </h1>
            </Link>
          </div>

          <nav className="app-sidebar-nav" aria-label="เมนูคอร์ส">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`sidebar-nav-item ${resolvedActiveTab === item.key ? 'active' : ''}`}
                  onClick={item.onClick}
                >
                  <span className={`sidebar-nav-icon ${item.key}`} aria-hidden="true">
                    <Icon size={20} strokeWidth={2} />
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="app-header-utility">
          <div className="app-header-profile" ref={headerProfileRef}>
            <button
              type="button"
              className="header-profile-trigger"
              onClick={() => setShowUserMenu((prev) => !prev)}
              aria-haspopup="menu"
              aria-expanded={showUserMenu}
              aria-label="เมนูโปรไฟล์"
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="" className="header-profile-avatar-image" />
              ) : (
                <span className="header-profile-avatar">{initial}</span>
              )}
              <span className="header-profile-name">{displayName}</span>
              <ChevronDown className="header-profile-caret" size={16} strokeWidth={2.2} aria-hidden="true" />
            </button>

            {showUserMenu ? (
              <div className="header-profile-dropdown" role="menu">
                <button type="button" onClick={handleOpenSettings} className="menu-action-button" role="menuitem">
                  ตั้งค่า
                </button>
                <button type="button" onClick={handleLogout} className="logout-button" role="menuitem">
                  ออกจากระบบ
                </button>
              </div>
            ) : null}
          </div>
        </div>

      </>
    );
  }

  return (
    <header className="app-header">
      <div className="header-container">
        <div className="header-left">
          <Link to={{ pathname: '/dashboard' }} state={{ activeTab: 'courses' }} className="app-title-link">
            <h1 className="app-title">
              <img src={logoImage} alt="TEWMai" className="app-logo" />
            </h1>
          </Link>
        </div>

        <div className="header-center">
          {showLandingNav ? (
            <nav className="landing-header-nav" aria-label="เมนูหน้าแรก">
              {landingNavItems.map((item) => (
                item.type === 'auth' ? (
                  <button
                    type="button"
                    onClick={() => handleAuthAction(item.mode || 'register')}
                    key={item.label}
                  >
                    {item.label}
                  </button>
                ) : (
                  <a href={item.href} key={item.label}>{item.label}</a>
                )
              ))}
            </nav>
          ) : null}
        </div>

        <div className="header-right">
          <div className="auth-actions">
            <button
              type="button"
              className="auth-action outline"
              onClick={() => handleAuthAction('login')}
            >
              เข้าสู่ระบบ
            </button>
            <button
              type="button"
              className="auth-action solid"
              onClick={() => handleAuthAction('register')}
            >
              ลงทะเบียน
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
