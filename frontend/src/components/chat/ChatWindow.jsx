import { useRef, useEffect, useState, useCallback } from "react";
import socket from "../../utils/socket";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Hash, Users, Info, Lock, Smile, Paperclip, X, FileIcon, Download, UserCog, Loader2 } from "lucide-react";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import RoomMembersModal from "./RoomMembersModal";

const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "😡"];

const ChatWindow = ({
    selectedUser,
    selectedUserObj,
    selectedRoomObj,
    isGroupSelected,
    messages,
    userName,
    typingUsers,
    formatLastSeen,
    renderMessageTicks,
    messageText,
    handleTyping,
    handleKeyPress,
    sendMessage,
    attachment,
    setAttachment,
    users = [],
    loadMoreMessages,
    hasMoreMap = {},
    loadingMore = false,
}) => {
    const messagesEndRef = useRef(null);
    const scrollContainerRef = useRef(null);
    const fileInputRef = useRef(null);
    const [lightboxSrc, setLightboxSrc] = useState(null);
    const [showMembersModal, setShowMembersModal] = useState(false);

    // Track whether this is the initial load for this chat (so we auto-scroll to bottom)
    const prevSelectedUserRef = useRef(null);
    const isInitialLoadRef = useRef(true);

    // When the selected chat changes, reset state and scroll to bottom
    useEffect(() => {
        if (selectedUser !== prevSelectedUserRef.current) {
            prevSelectedUserRef.current = selectedUser;
            isInitialLoadRef.current = true;
        }
    }, [selectedUser]);

    // Auto-scroll to bottom on initial load or when a new message arrives at the bottom
    useEffect(() => {
        if (!scrollContainerRef.current) return;
        const container = scrollContainerRef.current;

        if (isInitialLoadRef.current) {
            // On initial load, jump straight to the bottom
            container.scrollTop = container.scrollHeight;
            isInitialLoadRef.current = false;
            return;
        }

        // If already near the bottom (within 200px), keep scrolling down on new messages
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        if (distanceFromBottom < 200) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    // Handle scroll: trigger load-more when near the top
    const handleScroll = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        if (!selectedUser) return;

        // Only fire when backend explicitly told us there are older messages
        if (hasMoreMap[selectedUser] !== true) return;
        if (loadingMore) return;

        // Trigger when within 120px of the top
        if (container.scrollTop <= 120) {
            const currentMessages = messages.filter((msg) => {
                if (isGroupSelected) return msg.to === selectedUser && msg.isGroup === true;
                return (
                    (msg.from === userName && msg.to === selectedUser && !msg.isGroup) ||
                    (msg.from === selectedUser && msg.to === userName && !msg.isGroup)
                );
            });

            if (currentMessages.length === 0) return;

            // The oldest message in this chat's current view is the cursor
            const oldestMsg = currentMessages[0];
            // Use the stored ISO timestamp or fall back to parsing the display time
            const beforeTs = oldestMsg.createdAt || new Date(oldestMsg.time).toISOString();
            loadMoreMessages(selectedUser, isGroupSelected, beforeTs);
        }
    }, [selectedUser, isGroupSelected, hasMoreMap, loadingMore, messages, loadMoreMessages, userName]);

    // Preserve scroll position when older messages are prepended
    const prevScrollHeight = useRef(0);
    const prevFirstMsgId = useRef(null);

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const currentMessages = messages.filter((msg) => {
            if (isGroupSelected) return msg.to === selectedUser && msg.isGroup === true;
            return (
                (msg.from === userName && msg.to === selectedUser && !msg.isGroup) ||
                (msg.from === selectedUser && msg.to === userName && !msg.isGroup)
            );
        });

        const firstMsgId = currentMessages[0]?.id;

        // If the first message changed (prepend happened), restore scroll offset
        if (firstMsgId && firstMsgId !== prevFirstMsgId.current && prevScrollHeight.current > 0) {
            const addedHeight = container.scrollHeight - prevScrollHeight.current;
            container.scrollTop = container.scrollTop + addedHeight;
        }

        prevFirstMsgId.current = firstMsgId;
        prevScrollHeight.current = container.scrollHeight;
    }, [messages, selectedUser, isGroupSelected, userName]);

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) {
            alert("File too large. Maximum size is 10MB.");
            return;
        }
        const mediaType = file.type.startsWith("image/") ? "image"
            : file.type.startsWith("video/") ? "video"
                : "file";
        const reader = new FileReader();
        reader.onloadend = () => setAttachment({ dataUrl: reader.result, type: mediaType, name: file.name });
        reader.readAsDataURL(file);
        e.target.value = "";
    };

    const renderMediaBubble = (msg) => {
        if (!msg.mediaUrl) return null;
        if (msg.mediaType === "image") {
            return (
                <img
                    src={msg.mediaUrl}
                    alt={msg.mediaName || "image"}
                    className="max-w-[260px] rounded-xl cursor-pointer hover:opacity-90 transition-opacity mt-1 border border-white/20"
                    onClick={() => setLightboxSrc(msg.mediaUrl)}
                />
            );
        }
        if (msg.mediaType === "video") {
            return (
                <video
                    src={msg.mediaUrl}
                    controls
                    className="max-w-[280px] rounded-xl mt-1 border border-white/20"
                />
            );
        }
        return (
            <a
                href={msg.mediaUrl}
                download={msg.mediaName || "file"}
                className="flex items-center gap-2 mt-1 px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30 transition-colors border border-white/20 max-w-[240px]"
            >
                <FileIcon className="h-4 w-4 shrink-0" />
                <span className="text-xs truncate">{msg.mediaName || "Download file"}</span>
                <Download className="h-3.5 w-3.5 shrink-0 ml-auto" />
            </a>
        );
    };

    const currentMessages = messages.filter((msg) => {
        if (isGroupSelected) {
            return msg.to === selectedUser && msg.isGroup === true;
        } else {
            return (
                (msg.from === userName && msg.to === selectedUser && !msg.isGroup) ||
                (msg.from === selectedUser && msg.to === userName && !msg.isGroup)
            );
        }
    });

    const hasMore = hasMoreMap[selectedUser];

    const getChatHeader = () => {
        if (isGroupSelected && selectedRoomObj) {
            return (
                <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-linear-to-br from-indigo-500 to-purple-600 text-white font-semibold">
                            <Users className="h-5 w-5" />
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-lg leading-none">{selectedRoomObj.name}</h2>
                            {selectedRoomObj.isPrivate && <Lock className="h-4 w-4 text-sky-600" />}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {selectedRoomObj.members?.length || 0} members
                            </span>
                            {/* Info popover */}
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-4 w-4 p-0 hover:bg-transparent">
                                        <Info className="h-3 w-3 text-sky-600" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-64">
                                    <div className="space-y-2">
                                        <h4 className="font-medium leading-none">Room Info</h4>
                                        <p className="text-sm text-muted-foreground italic">
                                            {selectedRoomObj.description || "No description provided."}
                                        </p>
                                        <div className="pt-2">
                                            <h5 className="text-xs font-semibold mb-2">Members</h5>
                                            <div className="flex flex-wrap gap-1">
                                                {selectedRoomObj.members?.map((m) => (
                                                    <span key={m} className={`text-[10px] px-2 py-0.5 rounded-full ${m === userName ? "bg-sky-100 text-sky-700 font-bold" : "bg-gray-100 text-gray-700"}`}>
                                                        {m}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                            {/* Manage Members (creator only) */}
                            {selectedRoomObj.createdBy === userName && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 px-1.5 text-[10px] text-sky-600 hover:text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-900/20 gap-0.5 rounded-md"
                                    onClick={() => setShowMembersModal(true)}
                                >
                                    <UserCog className="h-3 w-3" /> Manage
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            );
        } else if (selectedUserObj) {
            const statusColor =
                selectedUserObj.status === "Busy" ? "bg-red-500" :
                    selectedUserObj.status === "Working" ? "bg-yellow-400" :
                        selectedUserObj.status === "Away" ? "bg-gray-400" :
                            "bg-emerald-500";
            const statusLabel =
                selectedUserObj.status === "Busy" ? "🔴 Busy" :
                    selectedUserObj.status === "Working" ? "🟡 Working" :
                        selectedUserObj.status === "Away" ? "⚫ Away" :
                            "🟢 Online";
            return (
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Avatar className="h-10 w-10 border-2 border-white dark:border-gray-800 shadow-sm">
                            <AvatarImage src={selectedUserObj.avatar} alt={selectedUser} className="object-cover" />
                            <AvatarFallback className={`${selectedUserObj.online
                                ? "bg-linear-to-br from-sky-500 to-cyan-500"
                                : "bg-linear-to-br from-gray-400 to-gray-500"
                                } text-white font-semibold`}>
                                {selectedUser.charAt(0).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        {selectedUserObj.online && (
                            <span className={`absolute bottom-0 right-0 w-3 h-3 ${statusColor} border-2 border-white dark:border-gray-900 rounded-full`} />
                        )}
                    </div>
                    <div className="flex flex-col">
                        <h2 className="font-bold text-lg leading-none">{selectedUser}</h2>
                        {selectedUserObj.online ? (
                            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                                {statusLabel}
                            </span>
                        ) : (
                            <span className="text-xs text-muted-foreground mt-0.5">
                                {formatLastSeen(selectedUserObj.lastSeen) ? `Last seen ${formatLastSeen(selectedUserObj.lastSeen)}` : "Offline"}
                            </span>
                        )}
                        {selectedUserObj.bio && (
                            <span className="text-xs text-muted-foreground/80 italic mt-0.5 max-w-[220px] truncate">{selectedUserObj.bio}</span>
                        )}
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="flex flex-col h-full bg-linear-to-b from-white to-sky-50 dark:from-gray-950 dark:to-sky-950/20">
            <header className="flex h-16 shrink-0 items-center justify-between border-b px-6 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md sticky top-0 z-10">
                {getChatHeader()}
            </header>

            {/* Scrollable message area — plain div so we control scroll events */}
            <div
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto p-6"
                onScroll={handleScroll}
                style={{ overscrollBehavior: "contain" }}
            >
                <div className="space-y-6 max-w-4xl mx-auto">

                    {/* Load-more indicator at the top */}
                    {loadingMore && (
                        <div className="flex justify-center py-2">
                            <Loader2 className="h-5 w-5 animate-spin text-sky-500" />
                        </div>
                    )}

                    {/* "Beginning of conversation" marker */}
                    {!loadingMore && hasMore === false && currentMessages.length > 0 && (
                        <div className="flex items-center gap-3 py-2">
                            <div className="flex-1 h-px bg-sky-100 dark:bg-sky-900/40" />
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap px-2 py-0.5 rounded-full bg-sky-50 dark:bg-sky-900/20 border border-sky-100 dark:border-sky-900">
                                Beginning of conversation
                            </span>
                            <div className="flex-1 h-px bg-sky-100 dark:bg-sky-900/40" />
                        </div>
                    )}

                    {currentMessages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[40vh] text-muted-foreground space-y-4">
                            <div className="w-16 h-16 rounded-full bg-sky-50 dark:bg-sky-900/20 flex items-center justify-center">
                                <Hash className="h-8 w-8 opacity-20" />
                            </div>
                            <p className="text-sm">No messages yet. Say hi!</p>
                        </div>
                    ) : (
                        currentMessages.map((msg, index) => {
                            const messageId = msg.id || msg._id;
                            return (
                                <div
                                    key={messageId || index}
                                    className={`flex flex-col group relative ${msg.from === userName ? "items-end" : "items-start"}`}
                                >
                                    {isGroupSelected && msg.from !== userName && (
                                        <span className="text-[10px] font-semibold text-sky-600 ml-1 mb-1">
                                            {msg.from}
                                        </span>
                                    )}
                                    <div className={`flex items-start gap-2 max-w-[85%] ${msg.from === userName ? "flex-row-reverse" : "flex-row"}`}>
                                        <div
                                            className={`rounded-2xl px-4 py-3 shadow-sm transition-all hover:shadow-md ${msg.from === userName
                                                ? "bg-linear-to-br from-sky-600 to-cyan-600 text-white rounded-tr-none"
                                                : "bg-white dark:bg-gray-800 text-foreground border border-sky-100/50 dark:border-sky-900/50 rounded-tl-none"
                                                }`}
                                        >
                                            {/* Media attachment */}
                                            {renderMediaBubble(msg)}
                                            {/* Text content */}
                                            {msg.message && (
                                                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words mt-1">
                                                    {msg.message}
                                                </p>
                                            )}
                                            <div
                                                className={`flex items-center gap-1 mt-1 text-[10px] ${msg.from === userName ? "text-sky-100 justify-end" : "text-muted-foreground"}`}
                                            >
                                                <span>{msg.time.split(",")[1]?.trim() || msg.time}</span>
                                                {msg.from === userName && renderMessageTicks(msg.status)}
                                            </div>
                                        </div>

                                        {/* Reaction Picker Trigger */}
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity self-center shrink-0">
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-sky-100 text-muted-foreground hover:text-sky-600">
                                                        <Smile className="h-4 w-4" />
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-1 rounded-full shadow-xl animate-in zoom-in-95 duration-200" side="top">
                                                    <div className="flex gap-1">
                                                        {REACTIONS.map(emoji => (
                                                            <Button
                                                                key={emoji}
                                                                variant="ghost"
                                                                size="icon"
                                                                className={`h-8 w-8 rounded-full hover:bg-sky-50 text-base ${msg.reactions?.find(r => r.emoji === emoji)?.users.includes(userName) ? "bg-sky-100" : ""}`}
                                                                onClick={() => socket.emit("react_to_message", { messageId, emoji })}
                                                            >
                                                                {emoji}
                                                            </Button>
                                                        ))}
                                                    </div>
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                    </div>

                                    {/* Reactions Display */}
                                    {msg.reactions && msg.reactions.length > 0 && (
                                        <div className={`flex flex-wrap gap-1 mt-1 z-10 ${msg.from === userName ? "justify-end mr-1" : "justify-start ml-1"}`}>
                                            {msg.reactions.map((r, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => socket.emit("react_to_message", { messageId, emoji: r.emoji })}
                                                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] border transition-all ${r.users.includes(userName)
                                                        ? "bg-sky-100 border-sky-200 text-sky-700"
                                                        : "bg-gray-50 border-gray-100 text-gray-500 hover:bg-gray-100"
                                                        }`}
                                                    title={r.users.join(", ")}
                                                >
                                                    <span>{r.emoji}</span>
                                                    <span className="font-bold">{r.users.length}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                    {/* Typing Indicator */}
                    {!isGroupSelected && typingUsers?.has?.(selectedUser) && (
                        <div className="flex items-start">
                            <div className="bg-sky-100/50 dark:bg-sky-900/30 rounded-2xl px-4 py-2 flex gap-1 items-center animate-pulse">
                                <span className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                <span className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                <span className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-bounce"></span>
                            </div>
                        </div>
                    )}
                    {isGroupSelected && typingUsers && Array.from(typingUsers).filter(u => u !== userName).length > 0 && (
                        <div className="flex items-start">
                            <div className="bg-sky-100/50 dark:bg-sky-900/30 rounded-2xl px-4 py-2 flex gap-2 items-center">
                                <span className="text-[10px] font-medium text-sky-600">
                                    {Array.from(typingUsers).filter(u => u !== userName).join(", ")} {Array.from(typingUsers).filter(u => u !== userName).length > 1 ? "are typing..." : "is typing..."}
                                </span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </div>

            <div className="px-6 pb-6 pt-3 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-t">
                {/* Attachment Preview Strip */}
                {attachment && (
                    <div className="flex items-center gap-2 mb-3 p-2 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-900">
                        {attachment.type === "image" && (
                            <img src={attachment.dataUrl} alt="preview" className="h-10 w-10 rounded-lg object-cover border" />
                        )}
                        {attachment.type === "video" && (
                            <div className="h-10 w-10 rounded-lg bg-sky-200 dark:bg-sky-800 flex items-center justify-center">
                                <FileIcon className="h-5 w-5 text-sky-600" />
                            </div>
                        )}
                        {attachment.type === "file" && (
                            <div className="h-10 w-10 rounded-lg bg-sky-200 dark:bg-sky-800 flex items-center justify-center">
                                <FileIcon className="h-5 w-5 text-sky-600" />
                            </div>
                        )}
                        <span className="text-xs text-sky-700 dark:text-sky-300 font-medium truncate flex-1">{attachment.name}</span>
                        <button
                            onClick={() => setAttachment(null)}
                            className="p-1 rounded-full hover:bg-sky-200 dark:hover:bg-sky-800 transition-colors"
                        >
                            <X className="h-3.5 w-3.5 text-sky-600" />
                        </button>
                    </div>
                )}
                <form
                    onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
                    className="flex items-center gap-3 max-w-4xl mx-auto"
                >
                    {/* Hidden file input */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,video/*,.pdf,.doc,.docx,.txt,.zip"
                        className="hidden"
                        onChange={handleFileChange}
                    />
                    {/* Attachment button */}
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => fileInputRef.current?.click()}
                        className="h-[52px] w-[52px] rounded-2xl border border-sky-100 dark:border-sky-900 hover:bg-sky-50 dark:hover:bg-sky-950/30 text-sky-500 hover:text-sky-600 transition-all shrink-0"
                        title="Attach file"
                    >
                        <Paperclip className="h-5 w-5" />
                    </Button>
                    <div className="flex-1 relative group">
                        <Input
                            value={messageText}
                            onChange={(e) => handleTyping(e.target.value)}
                            onKeyDown={handleKeyPress}
                            placeholder={isGroupSelected ? `Message in ${selectedUser}...` : `Message @${selectedUser}...`}
                            className="pr-12 py-6 rounded-2xl border-sky-100 dark:border-sky-900 bg-linear-to-b from-sky-50/50 to-white dark:from-sky-950/20 dark:to-gray-950 focus-visible:ring-sky-500 ring-offset-sky-100 shadow-sm transition-all group-hover:shadow-md"
                        />
                    </div>
                    <Button
                        type="submit"
                        disabled={!messageText?.trim() && !attachment}
                        className="rounded-2xl h-[52px] w-[52px] bg-linear-to-br from-sky-600 to-cyan-600 hover:from-sky-700 hover:to-cyan-700 shadow-lg shadow-sky-600/20 transition-all hover:scale-105 active:scale-95 disabled:grayscale disabled:opacity-50"
                    >
                        <Send className="h-5 w-5" />
                    </Button>
                </form>
            </div>

            {/* Lightbox */}
            {lightboxSrc && (
                <div
                    className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
                    onClick={() => setLightboxSrc(null)}
                >
                    <img
                        src={lightboxSrc}
                        alt="Full size"
                        className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain"
                        onClick={(e) => e.stopPropagation()}
                    />
                    <button
                        onClick={() => setLightboxSrc(null)}
                        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                    >
                        <X className="h-6 w-6" />
                    </button>
                </div>
            )}

            {/* Room Members Modal */}
            <RoomMembersModal
                open={showMembersModal}
                onClose={() => setShowMembersModal(false)}
                roomObj={selectedRoomObj}
                userName={userName}
            />
        </div>
    );
};

export default ChatWindow;
