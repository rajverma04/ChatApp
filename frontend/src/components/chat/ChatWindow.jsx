import { useRef, useEffect } from "react";
import socket from "../../utils/socket";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Hash, Users, Info, Lock, Smile } from "lucide-react";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

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
}) => {
    const messagesEndRef = useRef(null);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, selectedUser]);

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
                        </div>
                    </div>
                </div>
            );
        } else if (selectedUserObj) {
            return (
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Avatar className="h-10 w-10 border-2 border-white dark:border-gray-800 shadow-sm">
                            <AvatarFallback className={`${selectedUserObj.online
                                ? "bg-linear-to-br from-sky-500 to-cyan-500"
                                : "bg-linear-to-br from-gray-400 to-gray-500"
                                } text-white font-semibold`}>
                                {selectedUser.charAt(0).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        {selectedUserObj.online && (
                            <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-gray-900 rounded-full animate-pulse"></span>
                        )}
                    </div>
                    <div className="flex flex-col">
                        <h2 className="font-bold text-lg leading-none">{selectedUser}</h2>
                        {selectedUserObj.online ? (
                            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                                ● Online
                            </span>
                        ) : (
                            <span className="text-xs text-muted-foreground mt-1">
                                {formatLastSeen(selectedUserObj.lastSeen) ? `Last seen ${formatLastSeen(selectedUserObj.lastSeen)}` : "Offline"}
                            </span>
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

            <ScrollArea className="flex-1 p-6">
                <div className="space-y-6 max-w-4xl mx-auto">
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
                                            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                                                {msg.message}
                                            </p>
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
                    {/* Typing Indicator in Window */}
                    {!isGroupSelected && typingUsers.has(selectedUser) && (
                        <div className="flex items-start">
                            <div className="bg-sky-100/50 dark:bg-sky-900/30 rounded-2xl px-4 py-2 flex gap-1 items-center animate-pulse">
                                <span className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                <span className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                <span className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-bounce"></span>
                            </div>
                        </div>
                    )}
                    {isGroupSelected && Array.from(typingUsers).filter(u => u !== userName).length > 0 && (
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
            </ScrollArea>

            <div className="p-6 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-t">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        sendMessage();
                    }}
                    className="flex items-center gap-3 max-w-4xl mx-auto"
                >
                    <div className="flex-1 relative group">
                        <Input
                            value={messageText}
                            onChange={(e) => {
                                handleTyping(e.target.value);
                            }}
                            onKeyDown={handleKeyPress}
                            placeholder={isGroupSelected ? `Message in ${selectedUser}...` : `Message @${selectedUser}...`}
                            className="pr-12 py-6 rounded-2xl border-sky-100 dark:border-sky-900 bg-linear-to-b from-sky-50/50 to-white dark:from-sky-950/20 dark:to-gray-950 focus-visible:ring-sky-500 ring-offset-sky-100 shadow-sm transition-all group-hover:shadow-md"
                        />
                    </div>
                    <Button
                        type="submit"
                        disabled={!messageText?.trim()}
                        className="rounded-2xl h-[52px] w-[52px] bg-linear-to-br from-sky-600 to-cyan-600 hover:from-sky-700 hover:to-cyan-700 shadow-lg shadow-sky-600/20 transition-all hover:scale-105 active:scale-95 disabled:grayscale disabled:opacity-50"
                    >
                        <Send className="h-5 w-5" />
                    </Button>
                </form>
            </div>
        </div>
    );
};

export default ChatWindow;
