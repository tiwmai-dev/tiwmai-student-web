import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { secureAPI } from '../utils/api';
import { parseApiDate } from '../utils/dateTime';
import { resolveStudentUserId } from '../utils/userIdentity';
import { useAuth } from '../contexts/AuthContext';

const PAYMENT_TIME_ZONE = 'Asia/Bangkok';

const formatThaiDateTime = (value) => {
  if (!value) return '-';
  const date = parseApiDate(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: PAYMENT_TIME_ZONE,
  }).format(date);
};

const formatThaiDate = (value) => {
  if (!value) return '-';
  const date = parseApiDate(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeZone: PAYMENT_TIME_ZONE,
  }).format(date);
};

const formatCurrencyTHB = (amount) => {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return '-';
  return `${value.toLocaleString('th-TH', { maximumFractionDigits: 2 })} บาท`;
};

const formatOrderReference = (row) => {
  const orderId = String(row?.order_id || '').trim();
  if (orderId) return orderId;
  const paymentIntentId = String(row?.payment_intent_id || '').trim();
  if (!paymentIntentId) return '-';
  if (paymentIntentId.length <= 14) return paymentIntentId;
  return `${paymentIntentId.slice(0, 8)}...${paymentIntentId.slice(-4)}`;
};

const PaymentHistoryPage = ({ user }) => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  const userId = useMemo(() => resolveStudentUserId(user), [user]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!userId) {
      setRows([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const payload = await secureAPI.courseAPI.getPaymentHistory(userId);
        if (!cancelled) {
          setRows(Array.isArray(payload?.rows) ? payload.rows : []);
        }
      } catch (err) {
        if (!cancelled) {
          setRows([]);
          setError(err?.message || 'โหลดประวัติการชำระเงินไม่สำเร็จ');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleSelectTab = (tab) => {
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

  return (
    <div className="payment-history-page">
      <Header user={user} onLogout={logout} activeTab="courses" onSelectTab={handleSelectTab} />

      <main className="payment-history-main">
        <section className="payment-history-section payment-history-shell" aria-label="ประวัติการชำระเงิน">
          <div className="payment-history-header">
            <h1>💳 ประวัติการชำระเงิน</h1>
            <span>{rows.length} รายการ</span>
          </div>

          {loading ? (
            <p className="payment-history-empty">กำลังโหลดประวัติการชำระเงิน...</p>
          ) : null}
          {!loading && error ? (
            <p className="payment-history-empty">{error}</p>
          ) : null}

          {!loading && !error ? (
            <div className="payment-history-table-wrap">
              {rows.length === 0 ? (
                <p className="payment-history-empty">ยังไม่มีประวัติการชำระเงิน</p>
              ) : (
                <table className="payment-history-table">
                  <thead>
	                    <tr>
	                      <th>วันที่ชำระ</th>
	                      <th>เลขคำสั่งซื้อ</th>
	                      <th>คอร์ส</th>
	                      <th>เริ่มเรียน</th>
	                      <th>หมดอายุ</th>
	                      <th>แพ็กเกจ</th>
	                      <th>จำนวนเงิน</th>
	                      <th>สถานะ</th>
	                      <th>ใบเสร็จ</th>
	                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => {
                      const planLabel = String(row?.plan_label || '').trim();
                      const durationMonths = Number(row?.duration_months);
                      const planText = planLabel
                        || (Number.isFinite(durationMonths) && durationMonths > 0 ? `${durationMonths} เดือน` : '-');
	                      const statusText = String(row?.payment_status || '').trim().toLowerCase() === 'succeeded'
	                        ? 'สำเร็จ'
	                        : (row?.payment_status || 'รอตรวจสอบ');

	                      return (
	                        <tr key={`${row?.enrollment_id || row?.payment_intent_id || row?.course_id || 'payment'}-${index}`}>
	                          <td>{formatThaiDateTime(row?.paid_at || row?.enrolled_at)}</td>
	                          <td className="payment-order-cell">{formatOrderReference(row)}</td>
	                          <td>{row?.course_name || '-'}</td>
	                          <td>{formatThaiDate(row?.started_at || row?.enrolled_at)}</td>
	                          <td>{formatThaiDate(row?.expires_at)}</td>
                          <td>{planText}</td>
                          <td>{formatCurrencyTHB(row?.paid_amount_thb)}</td>
                          <td>
                            <span className={`payment-status-chip ${statusText === 'สำเร็จ' ? 'success' : 'pending'}`}>
	                              {statusText}
	                            </span>
	                          </td>
	                          <td>
	                            {row?.receipt_url ? (
	                              <a
	                                className="payment-receipt-link"
	                                href={row.receipt_url}
	                                target="_blank"
	                                rel="noopener noreferrer"
	                              >
	                                เปิด
	                              </a>
	                            ) : (
	                              <span className="payment-receipt-empty">-</span>
	                            )}
	                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
};

export default PaymentHistoryPage;
