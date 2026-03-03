import { useState, useRef } from "react";
import socket from "../../utils/socket";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Camera, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

const STATUS_OPTIONS = [
    { value: "Online", label: "🟢 Online", color: "text-emerald-500" },
    { value: "Busy", label: "🔴 Busy", color: "text-red-500" },
    { value: "Working", label: "🟡 Working", color: "text-yellow-500" },
    { value: "Away", label: "⚫ Away", color: "text-gray-400" },
];

const UserProfileModal = ({ open, onClose, currentUser }) => {
    const [avatar, setAvatar] = useState(currentUser?.avatar || null);
    const [bio, setBio] = useState(currentUser?.bio || "");
    const [status, setStatus] = useState(currentUser?.status || "Online");
    const [newUsername, setNewUsername] = useState("");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const fileInputRef = useRef(null);

    const name = currentUser?.name || "";

    const handleImageChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            alert("Image must be under 2MB");
            return;
        }
        const reader = new FileReader();
        reader.onloadend = () => setAvatar(reader.result);
        reader.readAsDataURL(file);
    };

    const handleSave = () => {
        setErrorMsg("");
        setSaving(true);

        const doProfileSave = () => {
            socket.emit("update_profile", { avatar, bio, status });
            socket.once("profile_updated", () => {
                setSaving(false);
                setSaved(true);
                setTimeout(() => { setSaved(false); onClose(); }, 1200);
            });
        };

        // If username is being changed, do that first
        if (newUsername.trim() && newUsername.trim() !== name) {
            if (newUsername.trim().length < 3) {
                setSaving(false);
                return setErrorMsg("Username must be at least 3 characters");
            }
            socket.emit("change_username", { newName: newUsername.trim() });
            // Listen for success or error — page reloads on success (handled in useChatSession)
            socket.once("error", ({ message }) => {
                setSaving(false);
                setErrorMsg(message);
            });
            // Profile will be saved after reload via useChatSession auto-rejoin
            // Still save profile data now so it's not lost
            doProfileSave();
        } else {
            doProfileSave();
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-md rounded-2xl border-slate-200 dark:border-slate-800 shadow-2xl p-0 overflow-hidden">
                {/* Hero banner */}
                <div className="h-24 bg-linear-to-r from-sky-500 via-cyan-500 to-indigo-500" />

                <div className="px-6 pb-6 -mt-12">
                    <DialogHeader className="mb-4">
                        {/* Avatar with upload overlay */}
                        <div className="flex items-end gap-4">
                            <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                <Avatar className="h-20 w-20 ring-4 ring-white dark:ring-slate-900 shadow-xl">
                                    <AvatarImage src={avatar} alt={name} className="object-cover" />
                                    <AvatarFallback className="bg-linear-to-br from-sky-500 to-cyan-600 text-white text-2xl font-bold">
                                        {name.charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Camera className="h-6 w-6 text-white" />
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleImageChange}
                                />
                            </div>
                            <div className="mb-1">
                                <DialogTitle className="text-xl font-bold">{name}</DialogTitle>
                                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                                    Click the avatar to change your profile picture
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="space-y-4">
                        {/* Username change */}
                        <div className="space-y-1.5">
                            <Label htmlFor="username" className="text-sm font-medium">Change Username</Label>
                            <Input
                                id="username"
                                value={newUsername}
                                onChange={(e) => { setNewUsername(e.target.value); setErrorMsg(""); }}
                                placeholder={`Current: ${name}`}
                                minLength={3}
                                maxLength={30}
                                className="rounded-xl border-slate-200 dark:border-slate-700 focus-visible:ring-sky-500 text-sm"
                            />
                            <p className="text-xs text-muted-foreground">Must be unique · min 3 characters · leave blank to keep current</p>
                        </div>

                        {/* Error message */}
                        {errorMsg && (
                            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 rounded-xl px-3 py-2">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                {errorMsg}
                            </div>
                        )}

                        {/* Bio */}
                        <div className="space-y-1.5">
                            <Label htmlFor="bio" className="text-sm font-medium">Bio</Label>
                            <Textarea
                                id="bio"
                                value={bio}
                                onChange={(e) => setBio(e.target.value)}
                                placeholder="Tell others a little about yourself..."
                                maxLength={200}
                                rows={3}
                                className="resize-none rounded-xl border-slate-200 dark:border-slate-700 focus-visible:ring-sky-500 text-sm"
                            />
                            <p className="text-xs text-muted-foreground text-right">{bio.length}/200</p>
                        </div>

                        {/* Status */}
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium">Status</Label>
                            <Select value={status} onValueChange={setStatus}>
                                <SelectTrigger className="rounded-xl border-slate-200 dark:border-slate-700 focus:ring-sky-500">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl">
                                    {STATUS_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            <span className={opt.color}>{opt.label}</span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <DialogFooter className="mt-6 gap-2">
                        <Button
                            variant="outline"
                            onClick={onClose}
                            className="rounded-xl"
                            disabled={saving}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={saving || saved}
                            className="rounded-xl bg-linear-to-r from-sky-600 to-cyan-600 hover:from-sky-700 hover:to-cyan-700 shadow-lg shadow-sky-500/20 min-w-[100px] transition-all"
                        >
                            {saving ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : saved ? (
                                <span className="flex items-center gap-1.5">
                                    <CheckCircle2 className="h-4 w-4" /> Saved!
                                </span>
                            ) : (
                                "Save Profile"
                            )}
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default UserProfileModal;
