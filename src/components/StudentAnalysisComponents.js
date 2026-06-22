import React, { useMemo, useState } from 'react';

const joinBullets = (items) => (Array.isArray(items) ? items.filter(Boolean) : []);

const ResponseBody = ({ response }) => {
  if (!response) return null;
  if (typeof response === 'string') {
    return <p className="ai-response-text">{response}</p>;
  }
  const { title, summary, bullets } = response;
  return (
    <>
      {title ? <h4 className="ai-response-title">{title}</h4> : null}
      {summary ? <p className="ai-response-text">{summary}</p> : null}
      {joinBullets(bullets).length > 0 ? (
        <ul className="ai-response-list">
          {joinBullets(bullets).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
};

export const AiActionPanel = ({ actions = [], note, allowAsk = true, compact = false }) => {
  const [activeId, setActiveId] = useState(null);
  const [showAsk, setShowAsk] = useState(false);
  const [question, setQuestion] = useState('');

  const groupedActions = useMemo(() => {
    const groups = {
      strength: [],
      practice: [],
      help: [],
    };
    actions.forEach((item) => {
      const key = item.level || 'practice';
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return groups;
  }, [actions]);

  const getVisibleActions = (items) => (compact ? items.slice(0, 1) : items);

  return (
    <div className={`analysis-card ai-panel ${compact ? 'compact' : ''}`}>
      <div className="analysis-card-header">
        <h3>คำแนะนำจาก AI</h3>
        <p>{note || 'เลือกคำแนะนำที่เหมาะกับตอนนี้ แล้วเริ่มฝึกได้เลย'}</p>
      </div>
      <div className="ai-level-group">
        <div className="ai-level-title">🟢 จุดแข็ง</div>
        <div className="ai-level-cards">
          {getVisibleActions(groupedActions.strength).map((action) => (
            <div
              key={action.id}
              className={`ai-suggestion-card level-strength ${activeId === action.id ? 'open' : ''}`}
            >
              <button
                type="button"
                className="ai-suggestion-header"
                onClick={() => setActiveId(activeId === action.id ? null : action.id)}
              >
                <span className="ai-suggestion-label">{action.label}</span>
                <span className="ai-suggestion-toggle">{activeId === action.id ? 'ซ่อน' : 'ดูรายละเอียด'}</span>
              </button>
              {action.response?.summary ? (
                <p className="ai-suggestion-summary">{action.response.summary}</p>
              ) : null}
              <div className="ai-suggestion-actions">
                {action.linkHref ? (
                  <a className="ai-suggestion-link" href={action.linkHref}>
                    {action.linkLabel || 'ไปยังบทเรียนที่เกี่ยวข้อง'}
                  </a>
                ) : null}
              </div>
              {activeId === action.id ? (
                <div className="ai-response-card">
                  <ResponseBody response={action.response} />
                </div>
              ) : null}
            </div>
          ))}
          {compact && groupedActions.strength.length > 1 ? (
            <div className="ai-compact-note">มีคำแนะนำเพิ่มเติม {groupedActions.strength.length - 1} รายการ</div>
          ) : null}
        </div>
      </div>

      <div className="ai-level-group">
        <div className="ai-level-title">🟡 ควรฝึกเพิ่ม</div>
        <div className="ai-level-cards">
          {getVisibleActions(groupedActions.practice).map((action) => (
            <div
              key={action.id}
              className={`ai-suggestion-card level-practice ${activeId === action.id ? 'open' : ''}`}
            >
              <button
                type="button"
                className="ai-suggestion-header"
                onClick={() => setActiveId(activeId === action.id ? null : action.id)}
              >
                <span className="ai-suggestion-label">{action.label}</span>
                <span className="ai-suggestion-toggle">{activeId === action.id ? 'ซ่อน' : 'ดูรายละเอียด'}</span>
              </button>
              {action.response?.summary ? (
                <p className="ai-suggestion-summary">{action.response.summary}</p>
              ) : null}
              <div className="ai-suggestion-actions">
                {action.linkHref ? (
                  <a className="ai-suggestion-link" href={action.linkHref}>
                    {action.linkLabel || 'ไปยังบทเรียนที่เกี่ยวข้อง'}
                  </a>
                ) : null}
              </div>
              {activeId === action.id ? (
                <div className="ai-response-card">
                  <ResponseBody response={action.response} />
                </div>
              ) : null}
            </div>
          ))}
          {compact && groupedActions.practice.length > 1 ? (
            <div className="ai-compact-note">มีคำแนะนำเพิ่มเติม {groupedActions.practice.length - 1} รายการ</div>
          ) : null}
        </div>
      </div>

      <div className="ai-level-group">
        <div className="ai-level-title">🔴 ต้องการความช่วยเหลือ</div>
        <div className="ai-level-cards">
          {getVisibleActions(groupedActions.help).map((action) => (
            <div
              key={action.id}
              className={`ai-suggestion-card level-help ${activeId === action.id ? 'open' : ''}`}
            >
              <button
                type="button"
                className="ai-suggestion-header"
                onClick={() => setActiveId(activeId === action.id ? null : action.id)}
              >
                <span className="ai-suggestion-label">{action.label}</span>
                <span className="ai-suggestion-toggle">{activeId === action.id ? 'ซ่อน' : 'ดูรายละเอียด'}</span>
              </button>
              {action.response?.summary ? (
                <p className="ai-suggestion-summary">{action.response.summary}</p>
              ) : null}
              <div className="ai-suggestion-actions">
                {action.linkHref ? (
                  <a className="ai-suggestion-link" href={action.linkHref}>
                    {action.linkLabel || 'ไปยังบทเรียนที่เกี่ยวข้อง'}
                  </a>
                ) : null}
              </div>
              {activeId === action.id ? (
                <div className="ai-response-card">
                  <ResponseBody response={action.response} />
                </div>
              ) : null}
            </div>
          ))}
          {compact && groupedActions.help.length > 1 ? (
            <div className="ai-compact-note">มีคำแนะนำเพิ่มเติม {groupedActions.help.length - 1} รายการ</div>
          ) : null}
        </div>
      </div>

      {allowAsk && !compact ? (
        <div className="ai-ask">
          <button
            type="button"
            className="ai-ask-toggle"
            onClick={() => setShowAsk((prev) => !prev)}
          >
            {showAsk ? 'ปิดการถามเพิ่มเติม' : 'ถามคำถามเพิ่มเติม'}
          </button>
          {showAsk ? (
            <div className="ai-ask-body">
              <input
                type="text"
                placeholder="ถามคำถามเกี่ยวกับคอร์สนี้..."
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
              />
              <button type="button" className="ai-ask-send" disabled={!question.trim()}>
                ส่งคำถาม
              </button>
              <p className="ai-ask-hint">ระบบถามตอบจะเปิดใช้งานเมื่อเชื่อมต่อ API (TODO)</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export const StudentInsightCard = ({ insights, isPlaceholder }) => {
  const { strengths = [], weaknesses = [], focus = [], actions = [] } = insights || {};
  return (
    <div className={`analysis-card insight-card ${isPlaceholder ? 'placeholder' : ''}`}>
      <div className="analysis-card-header">
        <h3>ภาพรวมของเรา</h3>
        <p>จุดแข็ง จุดที่ควรฝึกเพิ่ม และสิ่งที่ทำต่อได้เลย</p>
      </div>
      {isPlaceholder ? <span className="analysis-badge">ตัวอย่างจากระบบ</span> : null}
      <div className="insight-grid">
        <div className="insight-block">
          <h4>💪 จุดแข็ง</h4>
          <ul>
            {joinBullets(strengths).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="insight-block">
          <h4>🎯 ควรฝึกเพิ่ม</h4>
          <ul>
            {joinBullets(weaknesses).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="insight-block">
          <h4>🧭 ควรโฟกัส</h4>
          <ul>
            {joinBullets(focus).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="insight-block">
          <h4>🚀 เริ่มทำต่อเลย</h4>
          <ul>
            {joinBullets(actions).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export const ProgressByTopic = ({ topics = [], isPlaceholder }) => {
  return (
    <div className={`analysis-card progress-card ${isPlaceholder ? 'placeholder' : ''}`}>
      <div className="analysis-card-header">
        <h3>ความคืบหน้าตามหัวข้อ</h3>
        <p>ดูความคืบหน้าแบบภาพรวมในแต่ละบท</p>
      </div>
      {isPlaceholder ? <span className="analysis-badge">ตัวอย่างจากระบบ</span> : null}
      <div className="progress-list">
        {topics.map((topic) => {
          const tone = topic.progress >= 80 ? 'good' : topic.progress >= 60 ? 'mid' : 'low';
          return (
          <div className="progress-row" key={topic.label}>
            <div className="progress-row-header">
              <span>{topic.label}</span>
              <strong>{topic.progress}%</strong>
            </div>
            <div className="progress-bar">
              <div
                className={`progress-bar-fill ${tone}`}
                style={{ width: `${topic.progress}%` }}
              />
            </div>
            {topic.note ? <p className="progress-note">{topic.note}</p> : null}
          </div>
        );
        })}
      </div>
    </div>
  );
};

export const EmptyStateCTA = ({
  title,
  description,
  hints = [],
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
}) => {
  return (
    <div className="analysis-card empty-cta">
      <div className="empty-cta-icon">📌</div>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
        {joinBullets(hints).length > 0 ? (
          <ul className="empty-cta-list">
            {joinBullets(hints).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
        <div className="empty-cta-actions">
          {primaryActionLabel ? (
            <button type="button" className="empty-cta-primary" onClick={onPrimaryAction}>
              {primaryActionLabel}
            </button>
          ) : null}
          {secondaryActionLabel ? (
            <button type="button" className="empty-cta-secondary" onClick={onSecondaryAction}>
              {secondaryActionLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
