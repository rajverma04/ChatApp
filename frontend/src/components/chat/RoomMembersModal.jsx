import { useState, useEffect } from "react";
import socket from "../../utils/socket";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Search, UserPlus, UserMinus, Crown, Loader2 } from "lucide-react";

const RoomMembersModal = ({ open, onClose, roomObj, userName }) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [actionMsg, setActionMsg] = useState("");

    const isCreator = roomObj?.createdBy === userName;

    useEffect(() => {
        if (!open) {
            setSearchQuery("");
            setSearchResults([]);
            setActionMsg("");
        }
    }, [open]);

    // Live search
    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            setSearching(false);
            return;
        }
        setSearching(true);
        const timeout = setTimeout(() => {
            socket.emit("search_user", { query: searchQuery });
        }, 300);

        const handleResults = (results) => {
            // Filter out already-members
            const members = roomObj?.members || [];
            setSearchResults(results.filter(r => !members.includes(r.name)));
            setSearching(false);
        };
        socket.on("search_results", handleResults);
        return () => {
            clearTimeout(timeout);
            socket.off("search_results", handleResults);
        };
    }, [searchQuery, roomObj?.members]);

    const handleAdd = (memberName) => {
        socket.emit("add_room_member", { roomName: roomObj.name, memberName });
        setActionMsg(`Added ${memberName}`);
        setSearchQuery("");
        setSearchResults([]);
        socket.once("room_member_added", () => setActionMsg(`✓ ${memberName} added`));
        socket.once("error", ({ message }) => setActionMsg(`✗ ${message}`));
    };

    const handleRemove = (memberName) => {
        socket.emit("remove_room_member", { roomName: roomObj.name, memberName });
        socket.once("room_member_removed", () => setActionMsg(`✓ ${memberName} removed`));
        socket.once("error", ({ message }) => setActionMsg(`✗ ${message}`));
    };

    if (!roomObj) return null;
    const members = (roomObj.members || []).filter(Boolean);

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-sm rounded-2xl p-0 overflow-hidden border-slate-200 dark:border-slate-800 shadow-2xl">
                <div className="h-16 bg-linear-to-r from-sky-500 via-cyan-500 to-indigo-500 flex items-center px-5">
                    <DialogTitle className="text-white font-bold text-lg">Manage Members</DialogTitle>
                </div>
                <div className="p-5 space-y-4">
                    <DialogDescription className="text-xs text-muted-foreground -mt-2">
                        Room: <span className="font-semibold text-foreground">#{roomObj.name}</span>
                        {actionMsg && <span className="ml-2 text-sky-600 font-medium">{actionMsg}</span>}
                    </DialogDescription>

                    {/* Current members */}
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {members.map((m) => (
                            <div key={m} className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                                <Avatar className="h-8 w-8 shrink-0">
                                    <AvatarFallback className="bg-linear-to-br from-sky-500 to-cyan-500 text-white text-xs font-bold">
                                        {m?.charAt(0)?.toUpperCase() ?? "?"}
                                    </AvatarFallback>
                                </Avatar>
                                <span className="text-sm font-medium flex-1">{m}</span>
                                {m === roomObj.createdBy && (
                                    <span className="flex items-center gap-1 text-[10px] text-amber-600 font-semibold">
                                        <Crown className="h-3 w-3" /> Admin
                                    </span>
                                )}
                                {isCreator && m !== userName && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all rounded-lg"
                                        onClick={() => handleRemove(m)}
                                        title="Remove member"
                                    >
                                        <UserMinus className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Add member search (creator only) */}
                    {isCreator && (
                        <div className="border-t pt-3 space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add Member</p>
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search by username…"
                                    className="pl-9 h-9 rounded-xl border-sky-100 dark:border-sky-900"
                                />
                                {searching && <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
                            </div>
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                                {searchResults.map((u) => (
                                    <div key={u.name} className="flex items-center gap-2 p-2 rounded-xl hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors">
                                        <Avatar className="h-7 w-7 shrink-0">
                                            <AvatarImage src={u.avatar} alt={u.name} className="object-cover" />
                                            <AvatarFallback className="text-xs bg-sky-100 text-sky-700">
                                                {u.name.charAt(0).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        <span className="text-sm flex-1">{u.name}</span>
                                        <Button
                                            size="sm"
                                            className="h-6 text-xs rounded-lg bg-sky-600 hover:bg-sky-700 px-2"
                                            onClick={() => handleAdd(u.name)}
                                        >
                                            <UserPlus className="h-3 w-3 mr-1" /> Add
                                        </Button>
                                    </div>
                                ))}
                                {searchQuery && !searching && searchResults.length === 0 && (
                                    <p className="text-xs text-muted-foreground text-center py-2">No users found</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default RoomMembersModal;
