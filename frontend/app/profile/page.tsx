"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated, getUser } from "@/lib/auth";
import type { StoredUser } from "@/lib/auth";
import { usersApi, BASE_URL } from "@/lib/api";
import Cookies from "js-cookie";
import {
  Lock,
  Loader2,
  CheckCircle,
  AlertCircle,
  Camera,
  Eye,
  EyeOff,
  Mail,
  Edit2,
  Check,
  X,
} from "lucide-react";
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

// Helper function to extract initials for fallback avatar
function getInitials(email: string, name?: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    if (parts[0]) return parts[0][0].toUpperCase();
  }
  const emailPart = email.split("@")[0];
  if (emailPart.length >= 2) {
    return emailPart.slice(0, 2).toUpperCase();
  }
  return emailPart[0]?.toUpperCase() || "?";
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);

  // Auth Redirect & Load User
  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
    } else {
      setUser(getUser());
    }
  }, [router]);

  // Check if we arrived from email verification redirect
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("email_verified") === "true") {
        setEmailSuccess("Email verified successfully!");
        // Refresh local user state and dispatch update to navbar
        const freshUser = getUser();
        setUser(freshUser);
        window.dispatchEvent(new Event("user_update"));
      }
    }
  }, []);

  // ── Feature: Display Name ──────────────────────────────────────────────────
  const [isEditingName, setIsEditingName] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [nameLoading, setNameLoading] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setDisplayNameInput(user.display_name || "");
    }
  }, [user, isEditingName]);

  const handleNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameError(null);
    setNameSuccess(null);

    const name = displayNameInput.trim();
    if (!name) {
      setNameError("Name cannot be empty");
      return;
    }

    if (name.length > 50) {
      setNameError("Name must not exceed 50 characters");
      return;
    }

    const nameRegex = /^[A-Za-zÀ-ÿ\s\-']+$/;
    if (!nameRegex.test(name)) {
      setNameError("Name contains invalid characters");
      return;
    }

    setNameLoading(true);
    try {
      const res = await usersApi.changeName(name);
      
      const current = getUser();
      if (current) {
        const updated = { ...current, display_name: res.data.display_name };
        Cookies.set("luminote_user", JSON.stringify(updated), { expires: 7, sameSite: "lax" });
        setUser(updated);
        window.dispatchEvent(new Event("user_update"));
      }
      
      setNameSuccess("Display name updated successfully!");
      setIsEditingName(false);
    } catch {
      setNameError("Failed to update name — please try again");
    } finally {
      setNameLoading(false);
    }
  };

  const handleCancelNameEdit = () => {
    setIsEditingName(false);
    setDisplayNameInput(user?.display_name || "");
    setNameError(null);
  };

  // ── Feature 1: Profile Picture ──────────────────────────────────────────────
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>({
    unit: "%",
    width: 90,
    height: 90,
    x: 5,
    y: 5,
  });
  const [completedCrop, setCompletedCrop] = useState<any>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarSuccess, setAvatarSuccess] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  
  const imageRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const getAvatarUrl = (url?: string | null) => {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    return `${BASE_URL}${url}`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const validTypes = ["image/jpeg", "image/png", "image/webp"];
      
      if (!validTypes.includes(file.type)) {
        setAvatarError("Invalid file type. Only JPEG, PNG, and WebP are allowed.");
        return;
      }
      
      if (file.size > 5 * 1024 * 1024) {
        setAvatarError("Image must be under 5MB");
        return;
      }
      
      setAvatarError(null);
      setAvatarSuccess(null);
      
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        setSrc(reader.result?.toString() || null);
      });
      reader.readAsDataURL(file);
    }
  };

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    imageRef.current = e.currentTarget;
    
    const initialCrop = centerCrop(
      makeAspectCrop(
        {
          unit: "%",
          width: 90,
        },
        1,
        width,
        height
      ),
      width,
      height
    );
    setCrop(initialCrop);
  };

  const handleCropConfirm = async () => {
    if (!imageRef.current || !completedCrop) return;
    setUploadingAvatar(true);
    setAvatarError(null);

    try {
      const image = imageRef.current;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Canvas 2D context is not available");
      }

      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;
      const pixelWidth = completedCrop.width * scaleX;
      const pixelHeight = completedCrop.height * scaleY;

      canvas.width = pixelWidth;
      canvas.height = pixelHeight;

      ctx.drawImage(
        image,
        completedCrop.x * scaleX,
        completedCrop.y * scaleY,
        pixelWidth,
        pixelHeight,
        0,
        0,
        pixelWidth,
        pixelHeight
      );

      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            setAvatarError("Failed to crop image.");
            setUploadingAvatar(false);
            return;
          }

          try {
            const res = await usersApi.uploadAvatar(blob, (progressEvent) => {
              const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              setUploadProgress(percent);
            });

            const current = getUser();
            if (current) {
              const updated = { ...current, avatar_url: res.data.avatar_url };
              Cookies.set("luminote_user", JSON.stringify(updated), { expires: 7, sameSite: "lax" });
              setUser(updated);
              window.dispatchEvent(new Event("user_update"));
            }
            setAvatarSuccess("Profile picture updated!");
            setSrc(null); // Dismiss crop view
          } catch {
            setAvatarError("Failed to upload image — please try again");
          } finally {
            setUploadingAvatar(false);
            setUploadProgress(null);
          }
        },
        "image/jpeg",
        0.9
      );
    } catch {
      setAvatarError("Failed to crop image — please try again");
      setUploadingAvatar(false);
    }
  };

  const handleRemovePhoto = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!confirm("Are you sure you want to remove your profile picture?")) return;
    setUploadingAvatar(true);
    setAvatarError(null);
    setAvatarSuccess(null);

    try {
      await usersApi.deleteAvatar();
      const current = getUser();
      if (current) {
        const updated = { ...current, avatar_url: null };
        Cookies.set("luminote_user", JSON.stringify(updated), { expires: 7, sameSite: "lax" });
        setUser(updated);
        window.dispatchEvent(new Event("user_update"));
      }
      setAvatarSuccess("Profile picture removed!");
    } catch {
      setAvatarError("Failed to remove profile picture.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  // ── Feature 2: Change Email ─────────────────────────────────────────────────
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [confirmNewEmail, setConfirmNewEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setEmailSuccess(null);

    if (newEmail !== confirmNewEmail) {
      setEmailError("Emails do not match");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      setEmailError("Enter a valid email");
      return;
    }

    if (newEmail === user?.email) {
      setEmailError("This is already your email");
      return;
    }

    setEmailLoading(true);
    try {
      await usersApi.changeEmail(newEmail, confirmNewEmail);
      setEmailSuccess("Email updated — please verify your new email");
      setPendingEmail(newEmail);
      setIsEditingEmail(false);
      setNewEmail("");
      setConfirmNewEmail("");
    } catch (err: any) {
      if (err.response?.status === 409) {
        setEmailError("This email is already in use");
      } else if (err.response?.status === 401) {
        setEmailError("Session expired — please log in again");
      } else {
        setEmailError(err.response?.data?.detail || "Failed to update email. Please try again.");
      }
    } finally {
      setEmailLoading(false);
    }
  };

  // ── Feature 3: Change Password ──────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  
  // Show/Hide Password states
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Live password strength algorithm
  const getPasswordStrength = (pwd: string): "weak" | "fair" | "strong" | null => {
    if (!pwd) return null;
    if (pwd.length < 8) return "weak";
    
    const hasUpper = /[A-Z]/.test(pwd);
    const hasLower = /[a-z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    const hasSpecial = /[^A-Za-z0-9]/.test(pwd);

    if (hasUpper && hasLower && hasNumber && hasSpecial) {
      return "strong";
    }
    return "fair";
  };

  const strength = getPasswordStrength(newPassword);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword) {
      setPasswordError("Current password must not be empty.");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    if (newPassword === currentPassword) {
      setPasswordError("New password must differ from current");
      return;
    }

    setPasswordLoading(true);
    try {
      await usersApi.changePassword(currentPassword, newPassword);
      setPasswordSuccess("Password updated successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      if (err.response?.status === 401) {
        setPasswordError("Current password is incorrect");
      } else {
        setPasswordError(err.response?.data?.detail || "Failed to update password.");
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#030303]">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 animate-slide-up">
      <div className="mb-8 border-b border-white/[0.06] pb-5">
        <h1 className="text-3xl font-bold text-gradient">Profile</h1>
        <p className="text-gray-500 text-sm mt-1">Manage your public profile settings and security details</p>
      </div>

      <div className="flex flex-col gap-8">
        {/* ── PROFILE DETAILS SECTION ──────────────────────────────────────── */}
        <section className="glass p-6 flex flex-col gap-6">
          <h2 className="text-xl font-bold text-neutral-200 border-b border-white/[0.04] pb-2">Profile Details</h2>
          
          <div className="flex flex-col md:flex-row gap-8 items-start">
            {/* Left Column: Avatar */}
            <div className="flex flex-col items-start gap-4 shrink-0 w-full md:w-auto">
              <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-wider">Profile Picture</h3>
              
              {avatarError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm max-w-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {avatarError}
                </div>
              )}

              {avatarSuccess && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm max-w-xs">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  {avatarSuccess}
                </div>
              )}

              <div className="flex items-center gap-4">
                <div 
                  className="relative w-24 h-24 rounded-full overflow-hidden border border-white/[0.08] shadow-lg group cursor-pointer bg-neutral-900 flex items-center justify-center shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {user.avatar_url ? (
                    <img
                      src={getAvatarUrl(user.avatar_url)}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-3xl font-bold text-brand-400 uppercase">
                      {getInitials(user.email, user.display_name || user.name)}
                    </span>
                  )}
                  {/* Camera Hover Overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-200">
                    <Camera className="w-6 h-6 text-white" />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs font-semibold text-neutral-300 hover:text-white transition-colors text-left"
                  >
                    Change photo
                  </button>
                  
                  {user.avatar_url && (
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors text-left"
                    >
                      Remove photo
                    </button>
                  )}
                  
                  <span className="text-[10px] text-gray-500">Supports JPEG, PNG, or WebP. Max 5MB.</span>
                </div>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
              />
            </div>

            {/* Divider */}
            <div className="hidden md:block w-px bg-white/[0.06] self-stretch min-h-[140px]" />

            {/* Right Column: Display Name */}
            <div className="flex-1 w-full flex flex-col gap-4">
              <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-wider">Display Name</h3>
              
              {nameError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {nameError}
                </div>
              )}

              {nameSuccess && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  {nameSuccess}
                </div>
              )}

              {!isEditingName ? (
                <div className="flex items-center justify-between p-4 rounded-xl bg-[#070709] border border-white/[0.04]">
                  <div>
                    <div className="text-xs text-neutral-500 font-medium">Public Name</div>
                    <div className="text-sm font-semibold text-neutral-200 mt-1">
                      {user.display_name || <span className="text-neutral-500 italic">Add your name</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsEditingName(true)}
                    className="btn-secondary !py-1.5 !px-3.5 flex items-center gap-1 text-xs"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                </div>
              ) : (
                <form onSubmit={handleNameSubmit} className="flex flex-col gap-4 p-4 rounded-xl bg-[#070709] border border-white/[0.04]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-neutral-400">Edit Display Name</span>
                    <span className="text-[10px] text-neutral-500 font-mono">
                      {displayNameInput.length}/50
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <input
                      type="text"
                      maxLength={60}
                      className="input !py-2"
                      placeholder="Enter your display name"
                      value={displayNameInput}
                      onChange={(e) => setDisplayNameInput(e.target.value)}
                      required
                    />
                  </div>

                  <div className="flex gap-2 mt-2">
                    <button
                      type="submit"
                      disabled={nameLoading}
                      className="btn-primary !py-2 text-xs px-6 flex items-center gap-1.5"
                    >
                      {nameLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelNameEdit}
                      disabled={nameLoading}
                      className="btn-secondary !py-2 text-xs px-6"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </section>

        {/* ── ACCOUNT / SECURITY SECTION ───────────────────────────────────── */}
        <section className="glass p-6 flex flex-col gap-6">
          <h2 className="text-xl font-bold text-neutral-200 border-b border-white/[0.04] pb-2">Account</h2>
          
          {/* Email Update Sub-Section */}
          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-bold text-neutral-300 uppercase tracking-wider">Email Address</h3>
            
            {emailError && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {emailError}
              </div>
            )}

            {emailSuccess && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                <CheckCircle className="w-4 h-4 shrink-0" />
                {emailSuccess}
              </div>
            )}

            {!isEditingEmail ? (
              <div className="flex items-center justify-between p-4 rounded-xl bg-[#070709] border border-white/[0.04]">
                <div>
                  <div className="text-xs text-neutral-500 font-medium">Active Email</div>
                  <div className="text-sm font-mono text-neutral-200 mt-1">{user.email}</div>
                  {pendingEmail && (
                    <div className="text-[10px] text-amber-400 mt-1.5 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      Pending verification to: {pendingEmail}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditingEmail(true)}
                  className="btn-secondary !py-1.5 !px-3.5 flex items-center gap-1 text-xs"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Edit
                </button>
              </div>
            ) : (
              <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4 max-w-md p-4 rounded-xl bg-[#070709] border border-white/[0.04]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-neutral-400">Change Email Address</span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingEmail(false);
                      setNewEmail("");
                      setConfirmNewEmail("");
                      setEmailError(null);
                    }}
                    className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-gray-400">New Email</label>
                  <input
                    type="email"
                    className="input !py-2"
                    placeholder="Enter new email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-gray-400">Confirm New Email</label>
                  <input
                    type="email"
                    className="input !py-2"
                    placeholder="Confirm new email"
                    value={confirmNewEmail}
                    onChange={(e) => setConfirmNewEmail(e.target.value)}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={emailLoading}
                  className="btn-primary !py-2 text-xs self-start px-6 flex items-center gap-1.5 mt-2"
                >
                  {emailLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                  Send Verification
                </button>
              </form>
            )}
          </div>

          <div className="h-px bg-white/[0.06]" />

          {/* Password Update Sub-Section */}
          <form onSubmit={handlePasswordChange} className="flex flex-col gap-4">
            <h3 className="text-sm font-bold text-neutral-300 uppercase tracking-wider">Change Password</h3>

            {passwordError && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {passwordError}
              </div>
            )}

            {passwordSuccess && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                <CheckCircle className="w-4 h-4 shrink-0" />
                {passwordSuccess}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5 relative">
                <label className="text-xs font-medium text-gray-400">Current Password</label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? "text" : "password"}
                    className="input !pr-10"
                    placeholder="Current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors"
                  >
                    {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 relative">
                <label className="text-xs font-medium text-gray-400">New Password</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    className="input !pr-10"
                    placeholder="Min. 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                
                {/* Live Password Strength Meter */}
                {strength && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-[10px] text-gray-500">Strength:</span>
                    <span className={`text-[10px] font-bold uppercase tracking-tight
                      ${strength === "weak" ? "text-red-400" : ""}
                      ${strength === "fair" ? "text-amber-400" : ""}
                      ${strength === "strong" ? "text-emerald-400" : ""}
                    `}>
                      {strength}
                    </span>
                    <div className="flex gap-1 flex-1 max-w-[80px] h-1 bg-neutral-900 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-300
                        ${strength === "weak" ? "w-1/3 bg-red-400" : ""}
                        ${strength === "fair" ? "w-2/3 bg-amber-400" : ""}
                        ${strength === "strong" ? "w-full bg-emerald-400" : ""}
                      `} />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5 relative">
                <label className="text-xs font-medium text-gray-400">Confirm New Password</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    className="input !pr-10"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="btn-primary mt-2 flex items-center justify-center gap-2 self-start px-6"
              disabled={passwordLoading}
            >
              {passwordLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              Change Password
            </button>
          </form>
        </section>
      </div>

      {/* ── ReactCrop Upload Dialog ────────────────────────────────────────── */}
      {src && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-surface-900 border border-border-muted rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Crop Profile Picture</h3>
              <button
                type="button"
                onClick={() => setSrc(null)}
                className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="overflow-hidden rounded-xl border border-white/[0.04] max-h-[50vh] flex items-center justify-center bg-[#030303]">
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={1}
                circularCrop
              >
                <img
                  src={src}
                  alt="Source"
                  onLoad={onImageLoad}
                  className="max-w-full max-h-[45vh] object-contain"
                />
              </ReactCrop>
            </div>
            
            {uploadingAvatar && uploadProgress !== null && (
              <div className="flex flex-col gap-1.5">
                <div className="text-[10px] text-neutral-400 text-right">{uploadProgress}%</div>
                <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-brand-500 h-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
            
            <div className="flex justify-end gap-3 mt-2">
              <button
                onClick={() => setSrc(null)}
                className="btn-secondary px-4 py-2 text-xs"
                disabled={uploadingAvatar}
              >
                Cancel
              </button>
              <button
                onClick={handleCropConfirm}
                className="btn-primary px-4 py-2 text-xs"
                disabled={uploadingAvatar}
              >
                {uploadingAvatar ? "Uploading..." : "Confirm & Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
