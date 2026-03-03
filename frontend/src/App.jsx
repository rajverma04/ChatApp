import socket from "./utils/socket";
import { useState, useRef, useEffect } from "react";
import { MessageCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";

// Extracted Components
import AuthForm from "./components/chat/AuthForm";
import ChatSidebar from "./components/chat/ChatSidebar";
import ChatWindow from "./components/chat/ChatWindow";

// Hooks and Utils
import { useChatSession } from "./hooks/useChatSession";
import { formatLastSeen, renderMessageTicks } from "./utils/chatUtils.jsx";
import { encryptMessage } from "./utils/crypto";

const App = () => {
  const [userName, setUserName] = useState(localStorage.getItem("chat_user") || "");
  const [password, setPassword] = useState(localStorage.getItem("chat_pass") || "");
  const [selectedUser, setSelectedUser] = useState("");
  const [isGroupSelected, setIsGroupSelected] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [attachment, setAttachment] = useState(null); // { dataUrl, type, name }

  const messagesEndRef = useRef(null);

  const {
    messages,
    setMessages,
    users,
    rooms,
    isConnected,
    typingUsers = new Set(),
    unreadCounts,
    typingTimeoutRef,
    searchResults,
    searchUsers,
    notifications,
    clearNotification,
    loadMoreMessages,
    hasMoreMap,
    loadingMore,
    usersRef,
  } = useChatSession(userName, password, selectedUser, isGroupSelected);

  const selectedUserObj = !isGroupSelected
    ? (users.find((u) => u.name === selectedUser) ?? searchResults.find((u) => u.name === selectedUser) ?? null)
    : null;
  const selectedRoomObj = isGroupSelected ? rooms.find((r) => r.name === selectedUser) : null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!messageText.trim() && !attachment) return;
    if (!selectedUser) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    socket.emit("stop_typing", { from: userName, to: selectedUser, isGroup: isGroupSelected });

    let data = messageText;
    let isEncrypted = false;

    if (!isGroupSelected && messageText.trim()) {
      // Encrypt DM text with recipient's ECDH public key
      const recipientObj = usersRef.current.find(u => u.name === selectedUser);
      if (recipientObj?.publicKey) {
        data = await encryptMessage(messageText, selectedUser, recipientObj.publicKey);
        isEncrypted = true;
      }
    }

    socket.emit("send_message", {
      userName,
      to: selectedUser,
      data,
      isGroup: isGroupSelected,
      isEncrypted,
      mediaUrl: attachment?.dataUrl || null,
      mediaType: attachment?.type || null,
      mediaName: attachment?.name || null,
    });
    setMessageText("");
    setAttachment(null);
  };

  const handleTyping = (value) => {
    setMessageText(value);
    if (!selectedUser) return;
    socket.emit("typing", { from: userName, to: selectedUser, isGroup: isGroupSelected });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("stop_typing", { from: userName, to: selectedUser, isGroup: isGroupSelected });
    }, 2000);
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!userName || !password) return;
    // Save credentials so the socket auto-rejoin can use them on refresh
    localStorage.setItem("chat_user", userName);
    localStorage.setItem("chat_pass", password);
    if (!socket.connected) socket.connect();
    socket.emit("join", { userName, password });
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-950 overflow-hidden font-sans antialiased text-slate-900 dark:text-slate-100 transition-colors duration-300">
      {!isConnected ? (
        <AuthForm
          userName={userName}
          setUserName={setUserName}
          password={password}
          setPassword={setPassword}
          handleSubmit={handleSubmit}
        />
      ) : (
        <SidebarProvider>
          <div className="flex h-full w-full overflow-hidden">
            <ChatSidebar
              userName={userName}
              users={users}
              rooms={rooms}
              selectedUser={selectedUser}
              setSelectedUser={setSelectedUser}
              isGroupSelected={isGroupSelected}
              setIsGroupSelected={setIsGroupSelected}
              typingUsers={typingUsers}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              formatLastSeen={formatLastSeen}
              unreadCounts={unreadCounts}
              setShowDisconnectDialog={setShowDisconnectDialog}
              searchResults={searchResults}
              searchUsers={searchUsers}
              notifications={notifications}
              clearNotification={clearNotification}
            />

            <SidebarInset className="flex flex-col flex-1 overflow-hidden">
              <header className="flex h-16 shrink-0 items-center justify-between px-6 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-20 transition-all duration-300">
                <div className="flex items-center gap-3">
                  <SidebarTrigger className="hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors p-2 rounded-lg" />
                  <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-sky-100 dark:bg-sky-900/30 rounded-lg">
                      <MessageCircle className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                    </div>
                    <h1 className="text-lg font-bold tracking-tight bg-linear-to-r from-sky-600 to-cyan-600 dark:from-sky-400 dark:to-cyan-400 bg-clip-text text-transparent">
                      Chat App
                    </h1>
                  </div>
                </div>
              </header>

              <main className="flex-1 overflow-hidden relative bg-slate-50/50 dark:bg-slate-950/50">
                <ChatWindow
                  selectedUser={selectedUser}
                  isGroupSelected={isGroupSelected}
                  selectedUserObj={selectedUserObj}
                  selectedRoomObj={selectedRoomObj}
                  messages={messages}
                  userName={userName}
                  messageText={messageText}
                  handleTyping={handleTyping}
                  handleKeyPress={handleKeyPress}
                  sendMessage={sendMessage}
                  typingUsers={typingUsers}
                  renderMessageTicks={renderMessageTicks}
                  formatLastSeen={formatLastSeen}
                  attachment={attachment}
                  setAttachment={setAttachment}
                  users={users}
                  loadMoreMessages={loadMoreMessages}
                  hasMoreMap={hasMoreMap}
                  loadingMore={loadingMore}
                />
              </main>
            </SidebarInset>
          </div>
        </SidebarProvider>
      )}

      <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <AlertDialogContent className="max-w-[400px] rounded-2xl border-slate-200 dark:border-slate-800 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">Logout?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-500 dark:text-slate-400">
              Are you sure you want to disconnect from the chat session?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-4">
            <button
              onClick={() => setShowDisconnectDialog(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <AlertDialogAction
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium border-none shadow-lg shadow-red-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
              onClick={() => {
                socket.emit("leave");
                socket.disconnect();
                localStorage.removeItem("chat_user");
                localStorage.removeItem("chat_pass");
                window.location.reload();
              }}
            >
              Logout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default App;
