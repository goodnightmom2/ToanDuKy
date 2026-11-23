import React from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Eye,
  History,
  Plus,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {SKILL_CLUSTER_LIST, SKILL_CLUSTERS} from '../config.ts';
import {JOURNEY_MILESTONES, JOURNEY_MILESTONES_BY_ID} from '../journey.ts';
import {
  autoSuggestMissionSet,
  computeSlotCoverage,
  validateMissionSet,
} from '../math/missionSetEngine.ts';
import {inferPatternIdForQuestion} from '../math/taxonomy.ts';
import {canEditSettingsOrUsers, dataService, generateId} from '../services/dataService.ts';
import type {
  ClassRoom,
  MissionSetRecord,
  MissionSlot,
  MissionSlotRole,
  MocId,
  QuestionItem,
  SkillCluster,
  UserAccount,
} from '../types.ts';
import {MathText} from './MathText.tsx';

interface MissionSetTabProps {
  user: UserAccount;
  classes: ClassRoom[];
  questions: QuestionItem[];
  onRefresh: () => void;
  onPreviewMocAsStudent?: (mocId: MocId, draftOverride?: MissionSetRecord) => void;
}

const ROLE_LABELS: Record<MissionSlotRole, string> = {
  warmup: 'Khởi động',
  main: 'Nhiệm vụ chính',
  practice: 'Củng cố',
  boss_hit: 'Đòn BOSS',
  transfer: 'Tự giải (không gợi ý)',
};

export const MissionSetTab: React.FC<MissionSetTabProps> = ({
  user,
  classes,
  questions,
  onRefresh,
  onPreviewMocAsStudent,
}) => {
  const isAdmin = canEditSettingsOrUsers(user);
  const taxonomy = React.useMemo(() => dataService.getTaxonomy(false), [questions.length]);
  const allMissionSets = React.useMemo(() => dataService.getMissionSets(user), [user, questions.length]);

  const [selectedMocId, setSelectedMocId] = React.useState<MocId>(1);
  const [selectedClassId, setSelectedClassId] = React.useState<string>('ALL');
  const [activeSlotId, setActiveSlotId] = React.useState<string | null>(null);
  const [statusMsg, setStatusMsg] = React.useState('');
  const [errorMsg, setErrorMsg] = React.useState('');

  // Right-column Bank Filters
  const [bankSearch, setBankSearch] = React.useState('');
  const [bankCluster, setBankCluster] = React.useState<SkillCluster | 'ALL'>('ALL');
  const [bankPattern, setBankPattern] = React.useState<string>('ALL');
  const [bankLevel, setBankLevel] = React.useState<number | 'ALL'>('ALL');
  const [draggedQuestionId, setDraggedQuestionId] = React.useState<string | null>(null);

  const canonicalId = `ms_moc_${selectedMocId}_${selectedClassId}`;
  const existingRecord = React.useMemo(() => {
    return (
      allMissionSets.find((m) => m.id === `${canonicalId}_draft`) ??
      allMissionSets.find((m) => m.id === canonicalId) ??
      null
    );
  }, [allMissionSets, canonicalId]);

  const [draft, setDraft] = React.useState<MissionSetRecord>(() =>
    existingRecord
      ? {...existingRecord}
      : autoSuggestMissionSet({
          mocId: selectedMocId,
          classId: selectedClassId,
          bank: questions,
          taxonomy,
          actorName: user.displayName,
          actorUid: user.uid,
        }),
  );

  // Sync draft when switching milestone or class scope
  React.useEffect(() => {
    setStatusMsg('');
    setErrorMsg('');
    const found =
      dataService.getMissionSets(user).find((m) => m.id === `${canonicalId}_draft`) ??
      dataService.getMissionSets(user).find((m) => m.id === canonicalId);
    const nextDraft = found
      ? {...found}
      : autoSuggestMissionSet({
          mocId: selectedMocId,
          classId: selectedClassId,
          bank: questions,
          taxonomy,
          actorName: user.displayName,
          actorUid: user.uid,
        });
    setDraft(nextDraft);
    setActiveSlotId(nextDraft.slots[0]?.id ?? nextDraft.bossSlots[0]?.id ?? null);
    const def = JOURNEY_MILESTONES_BY_ID[selectedMocId];
    setBankCluster(def.clusters[0] ?? 'ALL');
  }, [selectedMocId, selectedClassId]); // eslint-disable-line react-hooks/exhaustive-deps

  const validation = React.useMemo(() => validateMissionSet(draft, questions), [draft, questions]);
  const versions = React.useMemo(() => dataService.getMissionSetVersions(canonicalId), [canonicalId, statusMsg]);
  const auditLogs = React.useMemo(
    () => dataService.getAuditLogs(user).filter((l) => l.entityType === 'mission_set').slice(0, 8),
    [user, statusMsg],
  );

  const approvedBank = React.useMemo(
    () =>
      questions.filter(
        (q) =>
          q.review_status === 'approved' &&
          q.standalone !== false &&
          q.pattern_id !== 'OUT-00' &&
          !(q.flags ?? []).includes('out_of_chapter'),
      ),
    [questions],
  );

  const filteredBank = React.useMemo(() => {
    const term = bankSearch.trim().toLowerCase();
    return approvedBank.filter((q) => {
      if (bankCluster !== 'ALL' && q.cluster !== bankCluster) return false;
      if (bankPattern !== 'ALL' && inferPatternIdForQuestion(q) !== bankPattern) return false;
      if (bankLevel !== 'ALL' && q.level !== bankLevel) return false;
      if (term && !q.stem_vi.toLowerCase().includes(term) && !q.id.toLowerCase().includes(term)) {
        return false;
      }
      return true;
    });
  }, [approvedBank, bankCluster, bankPattern, bankLevel, bankSearch]);

  const updateSlot = (slotId: string, updater: (s: MissionSlot) => MissionSlot) => {
    setDraft((prev) => ({
      ...prev,
      slots: prev.slots.map((s) => (s.id === slotId ? updater(s) : s)),
      bossSlots: prev.bossSlots.map((s) => (s.id === slotId ? updater(s) : s)),
    }));
  };

  const addQuestionToSlot = (slotId: string, qId: string) => {
    updateSlot(slotId, (slot) => {
      const nextIds = Array.from(new Set([...slot.fixedQuestionIds, qId]));
      return {
        ...slot,
        mode: 'fixed',
        fixedQuestionIds: nextIds,
        count: Math.max(slot.count, nextIds.length),
      };
    });
    setStatusMsg(`Đã thêm câu [${qId}] vào ô đang chọn.`);
  };

  const handleAutoSuggest = () => {
    setStatusMsg('');
    setErrorMsg('');
    const suggested = autoSuggestMissionSet({
      mocId: selectedMocId,
      classId: selectedClassId,
      bank: questions,
      taxonomy,
      actorName: user.displayName,
      actorUid: user.uid,
    });
    setDraft(suggested);
    setActiveSlotId(suggested.slots[0]?.id ?? null);
    setStatusMsg(
      `Đã tạo bản nháp "Tự động đề xuất" cho Mốc ${selectedMocId} (mức tăng dần, đa dạng dạng bài). Kiểm tra rồi bấm Lưu nháp hoặc Xuất bản.`,
    );
  };

  const handleSaveDraft = (submitForAdmin = false) => {
    setStatusMsg('');
    setErrorMsg('');
    const res = dataService.saveMissionSetDraft(user, {
      ...draft,
      id: canonicalId,
      classId: selectedClassId,
      status: submitForAdmin ? 'pending_admin_review' : 'draft',
    });
    if (!res.ok || !res.record) {
      setErrorMsg(res.error ?? 'Không thể lưu bản nháp.');
      return;
    }
    setDraft(res.record);
    onRefresh();
    setStatusMsg(
      submitForAdmin
        ? `Đã gửi bộ nhiệm vụ Mốc ${selectedMocId} vào hàng chờ Admin duyệt & xuất bản.`
        : `Đã lưu bản nháp bộ nhiệm vụ Mốc ${selectedMocId}.`,
    );
  };

  const handlePublish = () => {
    setStatusMsg('');
    setErrorMsg('');
    if (!validation.valid) {
      setErrorMsg(`Chưa thể xuất bản vì còn ${validation.errors.length} lỗi kiểm tra hợp lệ bên dưới.`);
      return;
    }
    const saved = dataService.saveMissionSetDraft(user, {
      ...draft,
      id: canonicalId,
      classId: selectedClassId,
      status: 'draft',
    });
    if (!saved.ok || !saved.record) {
      setErrorMsg(saved.error ?? 'Lỗi lưu bản trước khi xuất bản.');
      return;
    }
    const pub = dataService.adminPublishMissionSet(user, saved.record.id);
    if (!pub.ok || !pub.record) {
      setErrorMsg(pub.error ?? 'Không thể xuất bản bộ nhiệm vụ.');
      return;
    }
    setDraft(pub.record);
    onRefresh();
    setStatusMsg(
      `Admin đã xuất bản bộ nhiệm vụ Mốc ${selectedMocId} (phiên bản v${pub.record.version}). Học viên bắt đầu lượt mới sẽ dùng bộ câu này ngay; học viên đang làm dở giữ nguyên lượt cũ.`,
    );
  };

  const mocDef = JOURNEY_MILESTONES_BY_ID[selectedMocId];

  const renderSlotCard = (slot: MissionSlot, isBoss: boolean) => {
    const cov = computeSlotCoverage(slot, questions);
    const isActive = activeSlotId === slot.id;
    return (
      <div
        key={slot.id}
        onClick={() => setActiveSlotId(slot.id)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const qId = e.dataTransfer.getData('text/plain') || draggedQuestionId;
          if (qId) addQuestionToSlot(slot.id, qId);
          setDraggedQuestionId(null);
        }}
        className={`p-3 rounded-2xl border-2 space-y-2 text-xs transition cursor-pointer ${
          isActive
            ? 'bg-[#FFFBF0] border-[#14284A] shadow-sm'
            : isBoss
              ? 'bg-[#FFF5E2] border-[#E0A93B]'
              : 'bg-white border-[#D9C293]'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
            <span
              className={`px-2 py-0.5 rounded font-extrabold text-[10px] ${
                isBoss
                  ? 'bg-[#C8392B] text-white'
                  : slot.role === 'transfer'
                    ? 'bg-[#14284A] text-white'
                    : 'bg-[#E6F6F3] text-[#145B4F]'
              }`}
            >
              {ROLE_LABELS[slot.role]}
            </span>
            <input
              type="text"
              value={slot.label}
              onChange={(e) => updateSlot(slot.id, (s) => ({...s, label: e.target.value}))}
              className="flex-1 min-w-[120px] px-2 py-0.5 rounded border border-transparent hover:border-[#CBB17D] focus:border-[#14284A] font-extrabold text-[#14284A] bg-transparent"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className={`px-2 py-0.5 rounded font-extrabold ${
                cov.sufficient
                  ? 'bg-[#E6F6F3] text-[#145B4F]'
                  : 'bg-[#FCE8E6] text-[#99261B]'
              }`}
            >
              {cov.sufficient ? '✓' : '⚠'} Khả dụng {cov.available}/{cov.needed} · {cov.patternDiversity} dạng
            </span>
            {!isBoss && draft.slots.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDraft((prev) => ({
                    ...prev,
                    slots: prev.slots.filter((s) => s.id !== slot.id),
                  }));
                }}
                className="p-1 text-[#99261B] hover:bg-[#FCE8E6] rounded"
                title="Xóa ô này"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Slot Mode, Count, Level Range & Verify Toggle */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="inline-flex rounded-lg border border-[#CBB17D] overflow-hidden bg-white">
            <button
              type="button"
              onClick={() => updateSlot(slot.id, (s) => ({...s, mode: 'random'}))}
              className={`flex-1 py-1 text-[11px] font-bold ${
                slot.mode === 'random' ? 'bg-[#2E9C8A] text-white' : 'text-[#14284A]'
              }`}
            >
              Ngẫu nhiên
            </button>
            <button
              type="button"
              onClick={() => updateSlot(slot.id, (s) => ({...s, mode: 'fixed'}))}
              className={`flex-1 py-1 text-[11px] font-bold ${
                slot.mode === 'fixed' ? 'bg-[#14284A] text-white' : 'text-[#14284A]'
              }`}
            >
              Cố định
            </button>
          </div>

          <label className="flex items-center gap-1 font-bold text-[#14284A]">
            Số câu:
            <input
              type="number"
              min={1}
              max={10}
              value={slot.count}
              onChange={(e) => updateSlot(slot.id, (s) => ({...s, count: Math.max(1, Number(e.target.value))}))}
              className="w-12 px-1.5 py-1 rounded border border-[#CBB17D] bg-white font-extrabold"
            />
          </label>

          <div className="flex items-center gap-1 font-bold text-[#14284A]">
            Mức:
            <select
              value={slot.levelMin}
              onChange={(e) => {
                const lv = Number(e.target.value) as 1 | 2 | 3 | 4;
                updateSlot(slot.id, (s) => ({
                  ...s,
                  levelMin: lv,
                  levelMax: Math.max(lv, s.levelMax) as 1 | 2 | 3 | 4,
                  filter: {...s.filter, minLevel: lv, maxLevel: Math.max(lv, s.levelMax) as 1 | 2 | 3 | 4},
                }));
              }}
              className="px-1.5 py-1 rounded border border-[#CBB17D] bg-white"
            >
              {[1, 2, 3, 4].map((lv) => <option key={lv} value={lv}>{lv}</option>)}
            </select>
            <span>–</span>
            <select
              value={slot.levelMax}
              onChange={(e) => {
                const lv = Number(e.target.value) as 1 | 2 | 3 | 4;
                updateSlot(slot.id, (s) => ({
                  ...s,
                  levelMax: Math.max(s.levelMin, lv) as 1 | 2 | 3 | 4,
                  filter: {...s.filter, maxLevel: Math.max(s.levelMin, lv) as 1 | 2 | 3 | 4},
                }));
              }}
              className="px-1.5 py-1 rounded border border-[#CBB17D] bg-white"
            >
              {[1, 2, 3, 4].map((lv) => <option key={lv} value={lv}>{lv}</option>)}
            </select>
          </div>

          <label className="flex items-center gap-1 font-bold text-[#14284A] cursor-pointer">
            <input
              type="checkbox"
              checked={slot.verifyMode}
              onChange={(e) => updateSlot(slot.id, (s) => ({...s, verifyMode: e.target.checked}))}
              className="accent-[#14284A]"
            />
            Kiểm chứng (0 gợi ý)
          </label>
        </div>

        {/* Random mode: cluster + pattern filter summary */}
        {slot.mode === 'random' ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] font-bold text-[#5B6B82]">Lọc chủ đề:</span>
            {SKILL_CLUSTER_LIST.map((c) => {
              const selected = (slot.filter?.clusters ?? []).includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() =>
                    updateSlot(slot.id, (s) => {
                      const curr = s.filter?.clusters ?? [];
                      const next = curr.includes(c) ? curr.filter((x) => x !== c) : [...curr, c];
                      return {...s, filter: {...s.filter, clusters: next}};
                    })
                  }
                  className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                    selected
                      ? 'bg-[#14284A] text-white border-[#14284A]'
                      : 'bg-white text-[#5B6B82] border-[#E5D3A8]'
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        ) : (
          /* Fixed mode: selected questions list */
          <div className="space-y-1 pt-1">
            {slot.fixedQuestionIds.length === 0 ? (
              <p className="text-[11px] italic text-[#8A5108]">
                Chưa chọn câu cố định. Kéo câu từ cột Ngân hàng bên phải vào đây hoặc bấm nút "+ Thêm".
              </p>
            ) : (
              slot.fixedQuestionIds.map((qId) => {
                const q = questions.find((x) => x.id === qId);
                return (
                  <div key={qId} className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg bg-white border border-[#E5D3A8]">
                    <span className="truncate font-semibold text-[#14284A]">
                      <strong>[{qId}]</strong>{' '}
                      {q ? <MathText text={q.stem_vi} maxLength={75} /> : '(Không tìm thấy)'}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateSlot(slot.id, (s) => ({
                          ...s,
                          fixedQuestionIds: s.fixedQuestionIds.filter((id) => id !== qId),
                        }))
                      }
                      className="text-[#99261B] font-bold shrink-0"
                    >
                      ×
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Bar: Class Scope + Actions */}
      <div className="notebook-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-extrabold text-[#14284A]">
            Set nhiệm vụ theo Trạm / Mốc (Gán câu hỏi &amp; Xuất bản có phiên bản)
          </h2>
          <p className="text-xs text-[#5B6B82]">
            Chọn mốc bên trái → chỉnh các ô câu hỏi ở giữa → kéo-thả hoặc bấm &ldquo;+ Thêm&rdquo; từ Ngân hàng bên phải.
            Mốc chưa xuất bản sẽ tự dùng bộ bốc mặc định của game.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white border-2 border-[#CBB17D] text-xs font-extrabold text-[#14284A]"
          >
            <option value="ALL">Phạm vi: Tất cả lớp (mặc định)</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                Riêng lớp {c.name} ({c.code})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAutoSuggest}
            className="btn-tactile btn-gold text-xs py-2 px-3"
          >
            <Sparkles className="w-4 h-4" /> Tự động đề xuất
          </button>
          {onPreviewMocAsStudent && (
            <button
              type="button"
              onClick={() => onPreviewMocAsStudent(selectedMocId, draft)}
              className="btn-tactile btn-paper text-xs py-2 px-3"
            >
              <Eye className="w-4 h-4" /> Xem trước như học viên (TEST)
            </button>
          )}
        </div>
      </div>

      {statusMsg && (
        <div className="p-3 rounded-xl bg-[#E6F6F3] border border-[#2E9C8A] text-xs font-bold text-[#145B4F] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 rounded-xl bg-[#FCE8E6] border border-[#C8392B] text-xs font-bold text-[#99261B] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 3-COLUMN WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT COLUMN (3 cols): 10 Milestones list with ✓/⚠ coverage status */}
        <div className="lg:col-span-3 notebook-card p-3 space-y-1.5">
          <p className="text-xs font-extrabold uppercase text-[#5B6B82] px-1">
            Danh sách 10 Mốc ({selectedClassId === 'ALL' ? 'Mọi lớp' : 'Riêng lớp'})
          </p>
          {JOURNEY_MILESTONES.map((m) => {
            const msKey = `ms_moc_${m.id}_${selectedClassId}`;
            const saved =
              allMissionSets.find((x) => x.id === `${msKey}_draft`) ??
              allMissionSets.find((x) => x.id === msKey);
            const checkSet =
              saved ??
              autoSuggestMissionSet({
                mocId: m.id,
                classId: selectedClassId,
                bank: questions,
                taxonomy,
                actorName: user.displayName,
                actorUid: user.uid,
              });
            const v = validateMissionSet(checkSet, questions);
            const active = selectedMocId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMocId(m.id)}
                className={`w-full text-left p-2.5 rounded-xl border-2 transition text-xs space-y-0.5 ${
                  active
                    ? 'bg-[#14284A] text-[#FFFBF0] border-[#14284A]'
                    : 'bg-[#FFFBF0] text-[#14284A] border-[#E5D3A8] hover:border-[#CBB17D]'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-extrabold">
                    Mốc {m.id}: {m.city}
                  </span>
                  <span className={v.valid ? (active ? 'text-[#8FD3E6]' : 'text-[#145B4F]') : 'text-[#D98A1F]'}>
                    {v.valid ? '✓ Đủ' : '⚠ Thiếu'}
                  </span>
                </div>
                <p className={`text-[10px] truncate ${active ? 'text-[#D9E6F7]' : 'text-[#5B6B82]'}`}>
                  {m.clusters.join(', ')} · {m.levelLabel}
                  {m.bossId ? ` · BOSS ${m.bossId}` : ''}
                </p>
                <div className="text-[10px] font-bold">
                  {saved ? (
                    saved.status === 'published' ? (
                      <span className={active ? 'text-[#8FF0D6]' : 'text-[#1F7A6B]'}>
                        Đã xuất bản (v{saved.version})
                      </span>
                    ) : saved.status === 'pending_admin_review' ? (
                      <span className="text-[#E0A93B]">Chờ Admin duyệt</span>
                    ) : (
                      <span className={active ? 'text-[#F7E7B8]' : 'text-[#8A5108]'}>Bản nháp</span>
                    )
                  ) : (
                    <span className={active ? 'text-[#B9CBE0]' : 'text-[#7A8799]'}>Mặc định hệ thống</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* MIDDLE COLUMN (5 cols): Slots Editor + Coverage Gauge + Validation + Publish/Rollback */}
        <div className="lg:col-span-5 space-y-3">
          <div className="notebook-card p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#E5D3A8] pb-2.5">
              <div>
                <p className="text-[11px] font-extrabold uppercase text-[#2E9C8A]">
                  MỐC {mocDef.id} · {mocDef.city} ({mocDef.stationId})
                </p>
                <h3 className="font-display text-lg font-extrabold text-[#14284A]">
                  {mocDef.sceneName}
                </h3>
                <p className="text-xs text-[#5B6B82]">
                  {mocDef.mathTopics} {mocDef.isBS01Full ? '· (Giữ nguyên luồng S01–S08, chỉ chỉnh ô bổ sung & BOSS)' : ''}
                </p>
              </div>
              <span
                className={`px-2.5 py-1 rounded-xl text-xs font-extrabold ${
                  validation.valid
                    ? 'bg-[#E6F6F3] text-[#145B4F] border border-[#2E9C8A]'
                    : 'bg-[#FFF5E2] text-[#8A5108] border border-[#D98A1F]'
                }`}
              >
                Câu khả dụng {validation.totalAvailable} / cần {validation.totalNeeded} · đa dạng: {validation.patternDiversity} dạng
              </span>
            </div>

            {/* Mission Slots */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-extrabold text-[#14284A]">
                  Chuỗi ô Nhiệm vụ mốc ({draft.slots.length} ô)
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const newSlot: MissionSlot = {
                      id: generateId('slot'),
                      role: 'practice',
                      label: `Ô ${draft.slots.length + 1} · Củng cố`,
                      mode: 'random',
                      count: 1,
                      levelMin: mocDef.levels[0] ?? 2,
                      levelMax: mocDef.levels[mocDef.levels.length - 1] ?? 2,
                      requiredToPass: true,
                      verifyMode: false,
                      fixedQuestionIds: [],
                      filter: {
                        clusters: [...mocDef.clusters],
                        minLevel: mocDef.levels[0] ?? 2,
                        maxLevel: mocDef.levels[mocDef.levels.length - 1] ?? 2,
                      },
                    };
                    setDraft((prev) => ({...prev, slots: [...prev.slots, newSlot]}));
                    setActiveSlotId(newSlot.id);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FFF4D6] border border-[#D5B87E] text-xs font-bold text-[#14284A]"
                >
                  <Plus className="w-3.5 h-3.5" /> Thêm ô
                </button>
              </div>
              {draft.slots.map((s) => renderSlotCard(s, false))}
            </div>

            {/* BOSS Slots (if milestone has a BOSS) */}
            {draft.bossSlots.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-[#E5D3A8]">
                <p className="text-xs font-extrabold text-[#8A2B22]">
                  Chuỗi đòn BOSS {mocDef.bossId} ({draft.bossSlots.reduce((a, b) => a + b.count, 0)} đòn)
                </p>
                {draft.bossSlots.map((s) => renderSlotCard(s, true))}
              </div>
            )}

            {/* Validation Messages */}
            {validation.errors.length > 0 && (
              <div className="p-3 rounded-xl bg-[#FCE8E6] border border-[#C8392B] text-xs text-[#99261B] space-y-1">
                <p className="font-extrabold">Cần khắc phục trước khi xuất bản:</p>
                {validation.errors.map((e, i) => (
                  <p key={i}>• {e}</p>
                ))}
              </div>
            )}
            {validation.warnings.length > 0 && (
              <div className="p-2.5 rounded-xl bg-[#FFF5E2] border border-[#D98A1F] text-[11px] text-[#8A5108] space-y-1">
                {validation.warnings.map((w, i) => (
                  <p key={i}>⚠ {w}</p>
                ))}
              </div>
            )}

            {/* Notes + Action Buttons */}
            <input
              type="text"
              value={draft.notes}
              onChange={(e) => setDraft((prev) => ({...prev, notes: e.target.value}))}
              placeholder="Ghi chú phiên bản bộ nhiệm vụ..."
              className="w-full px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-xs"
            />

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleSaveDraft(false)}
                className="btn-tactile btn-paper text-xs py-2 px-3"
              >
                <Save className="w-3.5 h-3.5" /> Lưu nháp
              </button>
              {!isAdmin ? (
                <button
                  type="button"
                  disabled={!validation.valid}
                  onClick={() => handleSaveDraft(true)}
                  className="btn-tactile btn-jade text-xs py-2 px-3.5"
                >
                  <Send className="w-3.5 h-3.5" /> Gửi Admin duyệt &amp; xuất bản
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!validation.valid}
                  onClick={handlePublish}
                  className="btn-tactile btn-jade text-xs py-2 px-3.5"
                >
                  <ShieldCheck className="w-4 h-4" /> Xuất bản bộ nhiệm vụ (v{(existingRecord?.version ?? 0) + 1})
                </button>
              )}
            </div>

            {/* Version Rollback & Audit Log */}
            {isAdmin && versions.length > 0 && (
              <div className="pt-2 border-t border-[#E5D3A8] space-y-1.5 text-xs">
                <p className="font-extrabold text-[#14284A] inline-flex items-center gap-1">
                  <History className="w-3.5 h-3.5 text-[#2E9C8A]" /> Lịch sử phiên bản đã xuất bản:
                </p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {versions.map((v) => (
                    <div key={v.id} className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-[#FFFBF0] border border-[#E5D3A8]">
                      <span>
                        <strong>v{v.version}</strong> · {v.publishedBy} · {new Date(v.publishedAt).toLocaleString('vi-VN')}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const rb = dataService.adminRollbackMissionSet(user, canonicalId, v.version);
                          if (rb.ok && rb.record) {
                            setDraft(rb.record);
                            setStatusMsg(`Đã khôi phục phiên bản v${v.version} (thành v${rb.record.version}).`);
                            onRefresh();
                          }
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-[#CBB17D] font-bold text-[#14284A]"
                      >
                        <RotateCcw className="w-3 h-3" /> Khôi phục
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {auditLogs.length > 0 && (
              <details className="text-[11px] text-[#5B6B82]">
                <summary className="cursor-pointer font-bold text-[#14284A]">
                  Nhật ký chỉnh sửa gần đây ({auditLogs.length})
                </summary>
                <ul className="mt-1 space-y-1 pl-2">
                  {auditLogs.map((l) => (
                    <li key={l.id}>
                      • {new Date(l.createdAt).toLocaleString('vi-VN')} — <strong>{l.actorName}</strong>: {l.action} ({l.entityId})
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN (4 cols): Approved Bank Browser with Drag-and-Drop + Tap "+ Thêm" */}
        <div className="lg:col-span-4 notebook-card p-3.5 space-y-2.5 text-xs">
          <div className="space-y-1">
            <p className="font-extrabold text-[#14284A]">
              Ngân hàng câu Đã duyệt ({filteredBank.length})
            </p>
            <p className="text-[11px] text-[#5B6B82]">
              Kéo câu thả vào ô bên trái hoặc bấm nút <strong>+ Thêm</strong> để gắn vào ô đang chọn.
            </p>
          </div>

          <input
            type="text"
            value={bankSearch}
            onChange={(e) => setBankSearch(e.target.value)}
            placeholder="Tìm theo nội dung hoặc mã câu..."
            className="w-full px-3 py-1.5 rounded-xl bg-white border border-[#CBB17D]"
          />

          <div className="grid grid-cols-3 gap-1.5">
            <select
              value={bankCluster}
              onChange={(e) => setBankCluster(e.target.value as SkillCluster | 'ALL')}
              className="px-2 py-1.5 rounded-lg bg-white border border-[#CBB17D] font-bold"
            >
              <option value="ALL">Mọi chủ đề</option>
              {SKILL_CLUSTER_LIST.map((c) => (
                <option key={c} value={c}>{c} · {SKILL_CLUSTERS[c].shortTitle}</option>
              ))}
            </select>
            <select
              value={bankPattern}
              onChange={(e) => setBankPattern(e.target.value)}
              className="px-2 py-1.5 rounded-lg bg-white border border-[#CBB17D] font-bold"
            >
              <option value="ALL">Mọi dạng</option>
              {taxonomy.filter((t) => t.topic !== 'OUT').map((t) => (
                <option key={t.id} value={t.id}>{t.id}</option>
              ))}
            </select>
            <select
              value={bankLevel}
              onChange={(e) => setBankLevel(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
              className="px-2 py-1.5 rounded-lg bg-white border border-[#CBB17D] font-bold"
            >
              <option value="ALL">Mọi mức</option>
              {[1, 2, 3, 4].map((lv) => (
                <option key={lv} value={lv}>Mức {lv}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
            {filteredBank.length === 0 ? (
              <p className="text-center py-6 text-[#5B6B82]">
                Không có câu Đã duyệt nào khớp bộ lọc.
              </p>
            ) : (
              filteredBank.map((q) => {
                const patId = inferPatternIdForQuestion(q);
                return (
                  <div
                    key={q.id}
                    draggable
                    onDragStart={(e) => {
                      setDraggedQuestionId(q.id);
                      e.dataTransfer.setData('text/plain', q.id);
                    }}
                    className="p-2.5 rounded-xl bg-[#FFFBF0] border border-[#D9C293] hover:border-[#2E9C8A] space-y-1.5 cursor-grab active:cursor-grabbing"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="font-extrabold text-[#14284A]">
                        [{q.id}] · {patId} · Mức {q.level}
                      </span>
                      <button
                        type="button"
                        disabled={!activeSlotId}
                        onClick={() => {
                          if (activeSlotId) addQuestionToSlot(activeSlotId, q.id);
                        }}
                        className="px-2 py-0.5 rounded-lg bg-[#2E9C8A] text-white font-bold inline-flex items-center gap-0.5 shrink-0 disabled:opacity-40"
                      >
                        <Plus className="w-3 h-3" /> Thêm
                      </button>
                    </div>
                    <div className="text-[11px] text-[#1B2A41] line-clamp-3">
                      <MathText text={q.stem_vi} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
