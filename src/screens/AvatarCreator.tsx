import React from 'react';
import {Check, Lock, Sparkles} from 'lucide-react';
import {Avatar} from '../components/Avatar.tsx';
import {DongSonWatermark, WaveDivider} from '../components/HeritageMotifs.tsx';
import {HERO_NAME_CHIPS, OUTFITS} from '../config.ts';
import type {AvatarAppearance, AvatarView, UserAccount} from '../types.ts';

interface AvatarCreatorProps {
  user: UserAccount;
  onSave: (displayName: string, appearance: AvatarAppearance) => void;
  onCancel?: () => void;
}

const SKIN_TONES = [
  {label: 'Đào ấm', color: '#FFD0A8'},
  {label: 'Sáng nhẹ', color: '#FDE0C6'},
  {label: 'Tự nhiên', color: '#F6D3B3'},
  {label: 'Mật ong', color: '#E3B082'},
  {label: 'Nâu khỏe', color: '#C68D5B'},
];

const HAIR_COLORS = [
  {label: 'Đen than', color: '#22262D'},
  {label: 'Nâu hạt dẻ', color: '#5A3825'},
  {label: 'Xanh chàm', color: '#1F3B63'},
  {label: 'Nâu đỏ', color: '#8A3B2B'},
];

const HAIR_STYLES: Array<{id: AvatarAppearance['hairStyle']; label: string}> = [
  {id: 'spiky', label: 'Mái rối'},
  {id: 'ponytail', label: 'Hai chùm + ×'},
  {id: 'short', label: 'Tóc ngắn'},
  {id: 'bob', label: 'Tóc bob'},
  {id: 'bun', label: 'Búi cao'},
  {id: 'braid', label: 'Tết bím'},
];

const PRESET_BOY_EXPLORER: AvatarAppearance = {
  skinTone: '#FFD0A8',
  hairStyle: 'spiky',
  hairColor: '#22262D',
  eyeStyle: 'bright',
  browStyle: 'arch',
  mouthStyle: 'grin',
  outfitId: 'hoc_vien',
  outfitVariant: 'A',
  headwear: 'mu_tham_hiem',
  accessory: 'so_tay',
  cape: 'none',
  badge: 'la_ban',
};

const PRESET_GIRL_SCHOLAR: AvatarAppearance = {
  skinTone: '#FFD0A8',
  hairStyle: 'ponytail',
  hairColor: '#22262D',
  eyeStyle: 'bright',
  browStyle: 'arch',
  mouthStyle: 'grin',
  outfitId: 'hoc_vien',
  outfitVariant: 'B',
  headwear: 'none',
  accessory: 'so_tay',
  cape: 'none',
  badge: 'la_ban',
};

export const AvatarCreator: React.FC<AvatarCreatorProps> = ({user, onSave, onCancel}) => {
  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [displayName, setDisplayName] = React.useState(user.displayName);
  const [selectedHeroBio, setSelectedHeroBio] = React.useState<string>('');
  const [appearance, setAppearance] = React.useState<AvatarAppearance>({...user.avatar});
  const [previewView, setPreviewView] = React.useState<AvatarView>('front');
  const [previewLockedOutfitId, setPreviewLockedOutfitId] = React.useState<string | null>(null);

  const unlockedSet = new Set(user.inventory.outfits);
  const effectiveAppearance: AvatarAppearance = previewLockedOutfitId
    ? {...appearance, outfitId: previewLockedOutfitId}
    : appearance;

  const applyPreset = (preset: AvatarAppearance) => {
    setPreviewLockedOutfitId(null);
    setAppearance({...preset});
  };

  const handleConfirmSave = () => {
    const safeOutfit = unlockedSet.has(appearance.outfitId) ? appearance.outfitId : 'hoc_vien';
    onSave(displayName.trim() || user.displayName, {...appearance, outfitId: safeOutfit});
  };

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-5 space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#14284A]">
            Tạo nhân vật Chibi Toán Du Ký
          </h1>
          <p className="text-xs sm:text-sm text-[#4B5B73]">
            Mọi thay đổi hiện ngay trên bản xem trước và đồng bộ sang bản đồ, cảnh trạm 2D và đấu BOSS.
          </p>
        </div>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-tactile btn-paper text-xs sm:text-sm">
            Quay lại
          </button>
        )}
      </div>

      {/* Step tabs */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
        {[
          {id: 1 as const, label: '1. Biệt danh'},
          {id: 2 as const, label: '2. Ngoại hình'},
          {id: 3 as const, label: '3. Trang phục'},
        ].map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStep(s.id)}
            className={`py-2.5 px-2 sm:px-3 rounded-xl font-bold text-xs sm:text-sm border-2 transition ${
              step === s.id
                ? 'bg-[#14284A] text-[#FFFBF0] border-[#14284A]'
                : 'bg-[#FFFBF0] text-[#14284A] border-[#D5B87E]'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
        {/* Live Preview Panel */}
        <div className="lg:col-span-5 notebook-card p-4 sm:p-5 flex flex-col items-center space-y-3">
          <div className="w-full flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#4B5B73]">Xem trực tiếp</span>
            <div className="flex gap-1">
              {(['front', 'side', 'back'] as AvatarView[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setPreviewView(v)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border !min-h-[36px] ${
                    previewView === v
                      ? 'bg-[#1D7A6A] text-white border-[#145B4F]'
                      : 'bg-[#FFFBF0] text-[#14284A] border-[#CBB17D]'
                  }`}
                >
                  {v === 'front' ? 'Trước' : v === 'side' ? 'Nghiêng' : 'Sau'}
                </button>
              ))}
            </div>
          </div>

          {/* Heritage Preview Stage with subtle Đông Sơn bronze drum backdrop */}
          <div className="relative w-full py-4 rounded-2xl bg-gradient-to-b from-[#FFF7DF] to-[#F3E6C3] border border-[#D9C293] flex flex-col items-center overflow-hidden">
            <DongSonWatermark
              size={220}
              opacity={0.14}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            />
            <div className="relative z-10 flex flex-col items-center">
              <Avatar appearance={effectiveAppearance} view={previewView} frame="idle" size={215} />
              <p className="mt-1.5 font-display text-xl font-extrabold text-[#14284A]">
                {displayName.trim() || 'Học viên Toán Du Ký'}
              </p>
              {previewLockedOutfitId && (
                <p className="mt-1 text-xs font-semibold text-[#8A5608] px-3 text-center">
                  Đang xem thử bộ chưa mở khóa — khi lưu sẽ giữ bộ đã mở.
                </p>
              )}
            </div>
          </div>

          {/* 1-tap starter templates matching the 2 iconic Toán Du Ký characters */}
          <div className="w-full grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => applyPreset(PRESET_BOY_EXPLORER)}
              className={`px-2.5 py-2 rounded-xl text-xs font-bold border-2 transition ${
                appearance.outfitId === 'hoc_vien' && appearance.outfitVariant === 'A'
                  ? 'bg-[#FFF4D6] border-[#14284A] text-[#14284A]'
                  : 'bg-white border-[#D9C293] text-[#14284A] hover:bg-[#FFF8E6]'
              }`}
            >
              Mẫu Nam thám hiểm
            </button>
            <button
              type="button"
              onClick={() => applyPreset(PRESET_GIRL_SCHOLAR)}
              className={`px-2.5 py-2 rounded-xl text-xs font-bold border-2 transition ${
                appearance.outfitId === 'hoc_vien' && appearance.outfitVariant === 'B'
                  ? 'bg-[#E6F6F3] border-[#145B4F] text-[#14284A]'
                  : 'bg-white border-[#D9C293] text-[#14284A] hover:bg-[#FFF8E6]'
              }`}
            >
              Mẫu Nữ học viện
            </button>
          </div>

          <WaveDivider />

          <button
            type="button"
            onClick={handleConfirmSave}
            className="btn-tactile btn-jade w-full text-base"
          >
            <Check className="w-5 h-5" />
            Lưu nhân vật & Lên đường
          </button>
        </div>

        {/* Customization Controls */}
        <div className="lg:col-span-7 notebook-card p-4 sm:p-5 space-y-4">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-[#14284A] mb-1.5" htmlFor="nick-input">
                  Đặt biệt danh học viên (hiển thị trong game):
                </label>
                <input
                  id="nick-input"
                  type="text"
                  maxLength={28}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white border-2 border-[#CBB17D] font-bold text-[#14284A]"
                />
              </div>

              <div className="space-y-2">
                <h2 className="text-sm font-bold text-[#14284A]">
                  Hoặc chọn nhanh cảm hứng từ 19 nhân vật lịch sử & truyền thuyết Việt Nam:
                </h2>
                <p className="text-xs text-[#4B5B73]">
                  Lưu ý: Chỉ lấy cảm hứng đặt biệt danh; không gán công thức Toán cho nhân vật lịch sử. Giáo viên đối chiếu nguồn trước khi công bố.
                </p>

                <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto p-1">
                  {HERO_NAME_CHIPS.map((hero) => {
                    const active = displayName === hero.name;
                    return (
                      <button
                        key={hero.id}
                        type="button"
                        onClick={() => {
                          setDisplayName(hero.name);
                          setSelectedHeroBio(
                            hero.isLegend
                              ? `${hero.name} (Truyền thuyết): ${hero.bio}`
                              : `${hero.name}: ${hero.bio}`,
                          );
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition !min-h-[38px] ${
                          active
                            ? 'bg-[#1D7A6A] text-white border-[#145B4F]'
                            : 'bg-[#FFFBF0] text-[#14284A] border-[#D5B87E] hover:bg-[#FFF4D6]'
                        }`}
                      >
                        {hero.name}
                        {hero.isLegend ? ' · Truyền thuyết' : ''}
                      </button>
                    );
                  })}
                </div>

                {selectedHeroBio && (
                  <p className="p-3 rounded-xl bg-[#FFF4D6] border border-[#E0A93B] text-xs text-[#14284A] font-map">
                    {selectedHeroBio}
                  </p>
                )}
              </div>

              <div className="flex justify-end">
                <button type="button" onClick={() => setStep(2)} className="btn-tactile btn-gold text-sm">
                  Tiếp sang Ngoại hình →
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-bold text-[#14284A] mb-2">Màu da</p>
                <div className="flex flex-wrap gap-2">
                  {SKIN_TONES.map((st) => (
                    <button
                      key={st.color}
                      type="button"
                      onClick={() => setAppearance((a) => ({...a, skinTone: st.color}))}
                      className={`px-3 py-2 rounded-xl border-2 text-xs font-bold flex items-center gap-2 ${
                        appearance.skinTone === st.color
                          ? 'border-[#14284A] bg-[#FFF4D6]'
                          : 'border-[#D9C293] bg-white'
                      }`}
                    >
                      <span
                        className="w-5 h-5 rounded-full border border-[#14284A]"
                        style={{backgroundColor: st.color}}
                      />
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-bold text-[#14284A] mb-2">Kiểu tóc</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {HAIR_STYLES.map((hs) => (
                    <button
                      key={hs.id}
                      type="button"
                      onClick={() => setAppearance((a) => ({...a, hairStyle: hs.id}))}
                      className={`py-2 px-2.5 rounded-xl border-2 text-xs font-bold ${
                        appearance.hairStyle === hs.id
                          ? 'bg-[#1D7A6A] text-white border-[#145B4F]'
                          : 'bg-white text-[#14284A] border-[#D9C293]'
                      }`}
                    >
                      {hs.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-bold text-[#14284A] mb-2">Màu tóc</p>
                <div className="flex flex-wrap gap-2">
                  {HAIR_COLORS.map((hc) => (
                    <button
                      key={hc.color}
                      type="button"
                      onClick={() => setAppearance((a) => ({...a, hairColor: hc.color}))}
                      className={`px-3 py-2 rounded-xl border-2 text-xs font-bold flex items-center gap-2 ${
                        appearance.hairColor === hc.color
                          ? 'border-[#14284A] bg-[#FFF4D6]'
                          : 'border-[#D9C293] bg-white'
                      }`}
                    >
                      <span className="w-4 h-4 rounded-full" style={{backgroundColor: hc.color}} />
                      {hc.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#14284A] mb-1.5" htmlFor="eye-select">
                    Đôi mắt
                  </label>
                  <select
                    id="eye-select"
                    value={appearance.eyeStyle}
                    onChange={(e) =>
                      setAppearance((a) => ({
                        ...a,
                        eyeStyle: e.target.value as AvatarAppearance['eyeStyle'],
                      }))
                    }
                    className="w-full px-3 py-2.5 rounded-xl bg-white border-2 border-[#CBB17D] text-sm font-semibold text-[#14284A]"
                  >
                    <option value="bright">Sáng rỡ (mặc định)</option>
                    <option value="sparkle">Lấp lánh</option>
                    <option value="gentle">Dịu dàng</option>
                    <option value="focused">Tập trung</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#14284A] mb-1.5" htmlFor="brow-select">
                    Lông mày
                  </label>
                  <select
                    id="brow-select"
                    value={appearance.browStyle}
                    onChange={(e) =>
                      setAppearance((a) => ({
                        ...a,
                        browStyle: e.target.value as AvatarAppearance['browStyle'],
                      }))
                    }
                    className="w-full px-3 py-2.5 rounded-xl bg-white border-2 border-[#CBB17D] text-sm font-semibold text-[#14284A]"
                  >
                    <option value="arch">Thanh tú</option>
                    <option value="soft">Mềm mại</option>
                    <option value="determined">Quyết tâm</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#14284A] mb-1.5" htmlFor="mouth-select">
                    Nụ cười
                  </label>
                  <select
                    id="mouth-select"
                    value={appearance.mouthStyle}
                    onChange={(e) =>
                      setAppearance((a) => ({
                        ...a,
                        mouthStyle: e.target.value as AvatarAppearance['mouthStyle'],
                      }))
                    }
                    className="w-full px-3 py-2.5 rounded-xl bg-white border-2 border-[#CBB17D] text-sm font-semibold text-[#14284A]"
                  >
                    <option value="grin">Cười tươi (rạng rỡ)</option>
                    <option value="smile">Mỉm cười</option>
                    <option value="proud">Tự tin</option>
                    <option value="curious">Tò mò</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-between pt-2 gap-2">
                <button type="button" onClick={() => setStep(1)} className="btn-tactile btn-paper text-xs sm:text-sm">
                  ← Biệt danh
                </button>
                <button type="button" onClick={() => setStep(3)} className="btn-tactile btn-gold text-xs sm:text-sm">
                  Tiếp sang Trang phục →
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-[#14284A]">Trang phục & Biến thể</p>
                <div className="flex gap-1.5">
                  {(['A', 'B'] as const).map((variant) => (
                    <button
                      key={variant}
                      type="button"
                      onClick={() => setAppearance((a) => ({...a, outfitVariant: variant}))}
                      className={`px-3 py-1 rounded-lg text-xs font-bold border !min-h-[36px] ${
                        appearance.outfitVariant === variant
                          ? 'bg-[#14284A] text-white border-[#14284A]'
                          : 'bg-white text-[#14284A] border-[#CBB17D]'
                      }`}
                    >
                      {variant === 'A' ? 'Mẫu A (Nam)' : 'Mẫu B (Nữ)'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto pr-1">
                {OUTFITS.map((outfit) => {
                  const unlocked = unlockedSet.has(outfit.id);
                  const active = (previewLockedOutfitId ?? appearance.outfitId) === outfit.id;
                  return (
                    <button
                      key={outfit.id}
                      type="button"
                      onClick={() => {
                        if (unlocked) {
                          setPreviewLockedOutfitId(null);
                          setAppearance((a) => ({...a, outfitId: outfit.id}));
                        } else {
                          setPreviewLockedOutfitId(outfit.id);
                        }
                      }}
                      className={`p-3 rounded-xl border-2 text-left transition ${
                        active
                          ? 'bg-[#E6F6F3] border-[#1D7A6A]'
                          : 'bg-white border-[#D9C293] hover:bg-[#FFF8E6]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-[#14284A] flex items-center gap-1.5">
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-[#14284A] shrink-0"
                            style={{
                              backgroundColor:
                                appearance.outfitVariant === 'B' ? outfit.primaryB : outfit.primaryA,
                            }}
                          />
                          {outfit.name}
                        </span>
                        {!unlocked && <Lock className="w-4 h-4 text-[#7C4E31] shrink-0" />}
                      </div>
                      <p className="text-[11px] text-[#4B5B73] mt-1">{outfit.note}</p>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-[#E5D3A8]">
                <div>
                  <label className="block text-xs font-bold text-[#14284A] mb-1" htmlFor="headwear-select">
                    Mũ / Nón
                  </label>
                  <select
                    id="headwear-select"
                    value={appearance.headwear}
                    onChange={(e) =>
                      setAppearance((a) => ({
                        ...a,
                        headwear: e.target.value as AvatarAppearance['headwear'],
                      }))
                    }
                    className="w-full px-2.5 py-2 rounded-xl bg-white border-2 border-[#CBB17D] text-xs font-semibold text-[#14284A]"
                  >
                    <option value="mu_tham_hiem">Mũ sao vàng</option>
                    <option value="none">Không đội mũ</option>
                    <option value="non_la">Nón lá</option>
                    <option value="khan_ran">Khăn rằn</option>
                    <option value="vong_dong_son">Vòng Đông Sơn</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#14284A] mb-1" htmlFor="accessory-select">
                    Phụ kiện
                  </label>
                  <select
                    id="accessory-select"
                    value={appearance.accessory}
                    onChange={(e) =>
                      setAppearance((a) => ({
                        ...a,
                        accessory: e.target.value as AvatarAppearance['accessory'],
                      }))
                    }
                    className="w-full px-2.5 py-2 rounded-xl bg-white border-2 border-[#CBB17D] text-xs font-semibold text-[#14284A]"
                  >
                    <option value="so_tay">Bản đồ / Sổ Toán</option>
                    <option value="none">Không</option>
                    <option value="kinh_tron">Kính tròn</option>
                    <option value="compa_deo">Compa đeo</option>
                    <option value="ong_nhom">Ống nhòm</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#14284A] mb-1" htmlFor="cape-select">
                    Khăn / Choàng
                  </label>
                  <select
                    id="cape-select"
                    value={appearance.cape}
                    onChange={(e) =>
                      setAppearance((a) => ({
                        ...a,
                        cape: e.target.value as AvatarAppearance['cape'],
                      }))
                    }
                    className="w-full px-2.5 py-2 rounded-xl bg-white border-2 border-[#CBB17D] text-xs font-semibold text-[#14284A]"
                  >
                    <option value="none">Không</option>
                    <option value="khan_choang_ngoc">Khăn ngọc</option>
                    <option value="ao_choang_vang">Choàng vàng</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#14284A] mb-1" htmlFor="badge-select">
                    Huy hiệu
                  </label>
                  <select
                    id="badge-select"
                    value={appearance.badge}
                    onChange={(e) =>
                      setAppearance((a) => ({
                        ...a,
                        badge: e.target.value as AvatarAppearance['badge'],
                      }))
                    }
                    className="w-full px-2.5 py-2 rounded-xl bg-white border-2 border-[#CBB17D] text-xs font-semibold text-[#14284A]"
                  >
                    <option value="la_ban">La bàn</option>
                    <option value="none">Không</option>
                    <option value="chim_lac">Chim Lạc</option>
                    <option value="tam_giac_vang">Tam giác vàng</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 gap-2">
                <button type="button" onClick={() => setStep(2)} className="btn-tactile btn-paper text-xs sm:text-sm">
                  ← Ngoại hình
                </button>
                <button type="button" onClick={handleConfirmSave} className="btn-tactile btn-jade text-xs sm:text-sm">
                  <Sparkles className="w-4 h-4" />
                  Hoàn tất nhân vật
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
