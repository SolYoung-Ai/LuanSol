/* ============================================================
 * 用户资料云端同步（头像 / 生日 / 简介）
 * ------------------------------------------------------------
 *  - 数据存储在 PostgreSQL lunasol_user_profiles 表
 *  - RLS 策略：用户只能读写自己的资料
 *  - 登录后自动加载，修改后自动保存到云端
 * ============================================================ */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './auth';
import { db } from './sdk';

export interface UserProfile {
  id: string;
  owner_id: string;
  avatar_url: string;
  birthday: string;
  bio: string;
  created_at: string;
  updated_at: string;
}

interface ProfileCtx {
  profile: UserProfile | null;
  loading: boolean;
  refresh: () => Promise<void>;
  updateAvatar: (avatarUrl: string) => Promise<void>;
  updateBirthday: (birthday: string) => Promise<void>;
  updateBio: (bio: string) => Promise<void>;
}

const Ctx = createContext<ProfileCtx | null>(null);

export const useProfile = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('ProfileContext missing');
  return c;
};

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const u = auth.user;
    if (!u) { setProfile(null); return; }
    const d = await db();
    if (!d) return;
    const dbClient = d;
    setLoading(true);
    try {
      const r = await d.from('lunasol_user_profiles').select('*').eq('owner_id', u.id).limit(1);
      const rows = (r?.data || []) as UserProfile[];
      if (rows.length) {
        setProfile(rows[0]);
      } else {
        // 新用户，创建空资料
        const newProfile = {
          id: u.id, // 用 uid 作为 id
          owner_id: u.id,
          avatar_url: '',
          birthday: '',
          bio: '',
        };
        await d.from('lunasol_user_profiles').insert(newProfile);
        // 插入后重新查询
        const r2 = await d.from('lunasol_user_profiles').select('*').eq('owner_id', u.id).limit(1);
        const rows2 = (r2?.data || []) as UserProfile[];
        if (rows2.length) {
          setProfile(rows2[0]);
        }
      }
    } catch (e) {
      console.error('加载用户资料失败', e);
    } finally {
      setLoading(false);
    }
  }, [auth.user?.id]);

  useEffect(() => { void load(); }, [load]);

  const updateAvatar = useCallback(async (avatarUrl: string) => {
    if (!auth.user) throw new Error('未登录');
    const d = await db();
    if (!d) throw new Error('数据库未连接');
    const r = await d.from('lunasol_user_profiles')
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq('owner_id', auth.user.id);
    if (r?.error) throw new Error(r.error.message || '头像保存失败');
    // 检查是否真的更新了行
    if (r?.data && Array.isArray(r.data) && r.data.length === 0) {
      // 可能行不存在，尝试 upsert
      const row = {
        id: auth.user.id,
        owner_id: auth.user.id,
        avatar_url: avatarUrl,
        birthday: profile?.birthday || '',
        bio: profile?.bio || '',
      };
      const r2 = await d.from('lunasol_user_profiles').upsert(row, { onConflict: 'id' });
      if (r2?.error) throw new Error(r2.error.message || '头像保存失败');
    }
    setProfile((prev) => prev ? { ...prev, avatar_url: avatarUrl } : prev);
  }, [auth.user?.id, profile?.birthday, profile?.bio]);

  const updateBirthday = useCallback(async (birthday: string) => {
    if (!auth.user) throw new Error('未登录');
    const d = await db();
    if (!d) throw new Error('数据库未连接');
    const r = await d.from('lunasol_user_profiles')
      .update({ birthday, updated_at: new Date().toISOString() })
      .eq('owner_id', auth.user.id);
    if (r?.error) throw new Error(r.error.message || '生日保存失败');
    if (r?.data && Array.isArray(r.data) && r.data.length === 0) {
      const row = {
        id: auth.user.id,
        owner_id: auth.user.id,
        avatar_url: profile?.avatar_url || '',
        birthday,
        bio: profile?.bio || '',
      };
      const r2 = await d.from('lunasol_user_profiles').upsert(row, { onConflict: 'id' });
      if (r2?.error) throw new Error(r2.error.message || '生日保存失败');
    }
    setProfile((prev) => prev ? { ...prev, birthday } : prev);
  }, [auth.user?.id, profile?.avatar_url, profile?.bio]);

  const updateBio = useCallback(async (bio: string) => {
    if (!auth.user) throw new Error('未登录');
    const d = await db();
    if (!d) throw new Error('数据库未连接');
    const r = await d.from('lunasol_user_profiles')
      .update({ bio, updated_at: new Date().toISOString() })
      .eq('owner_id', auth.user.id);
    if (r?.error) throw new Error(r.error.message || '简介保存失败');
    setProfile((prev) => prev ? { ...prev, bio } : prev);
  }, [auth.user?.id]);

  return (
    <Ctx.Provider value={{ profile, loading, refresh: load, updateAvatar, updateBirthday, updateBio }}>
      {children}
    </Ctx.Provider>
  );
}
