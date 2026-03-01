import socket from "./utils/socket";
import { useState, useEffect, useRef } from "react";
import { MessageCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
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

const App = () => {
  const SEND_MESSAGE = "send_message";
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [userName, setUserName] = useState(localStorage.getItem("chat_user") || "");
  const [password, setPassword] = useState(localStorage.getItem("chat_pass") || "");
  const [selectedUser, setSelectedUser] = useState("");
  const [isGroupSelected, setIsGroupSelected] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [unreadCounts, setUnreadCounts] = useState({});
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Helper function to format last seen time
  const formatLastSeen = (lastSeenISO) => {
    if (!lastSeenISO) return "";
    const now = new Date();
    const lastSeen = new Date(lastSeenISO);
    const diffMs = now - lastSeen;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return lastSeen.toLocaleDateString();
  };

  // Helper function to render message status ticks
  const renderMessageTicks = (status) => {
    if (status === "sent") {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block ml-1"><path d="M20 6 9 17l-5-5" /></svg>
      );
    } else if (status === "delivered") {
      return (
        <span className="inline-flex ml-1">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="-mr-1.5"><path d="M20 6 9 17l-5-5" /></svg>
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </span>
      );
    } else if (status === "read") {
      return (
        <span className="inline-flex ml-1 text-red-700">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="-mr-1.5"><path d="M20 6 9 17l-5-5" /></svg>
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </span>
      );
    }
    return null;
  };

  const selectedUserObj = !isGroupSelected ? users.find((u) => u.name === selectedUser) : null;
  const selectedRoomObj = isGroupSelected ? rooms.find((r) => r.name === selectedUser) : null;

  useEffect(() => {
    if (selectedUser && isConnected) {
      if (isGroupSelected) {
        socket.emit("mark_room_read", { roomName: selectedUser });
      } else {
        socket.emit("messages_read", { from: selectedUser, to: userName });
      }

      setUnreadCounts((prev) => {
        if (!prev[selectedUser]) return prev;
        const newCounts = { ...prev };
        delete newCounts[selectedUser];
        return newCounts;
      });
    }
  }, [messages, selectedUser, userName, isConnected, isGroupSelected]);

  useEffect(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    if (selectedUser && isConnected) {
      socket.emit("messages_read", { from: selectedUser, to: userName });
    }
  }, [selectedUser, userName, isConnected]);

  useEffect(() => {
    socket.on("users", (usersData) => {
      setUsers(usersData);
    });
    socket.on("rooms", (roomsData) => {
      setRooms(roomsData);
    });
    socket.on("message_history", (history) => {
      setMessages(history);
    });
    socket.on("join_success", () => {
      setIsConnected(true);
      // Persist credentials on successful login
      localStorage.setItem("chat_user", userName);
      localStorage.setItem("chat_pass", password);
    });
    socket.on("create_room_success", (room) => {
      setSelectedUser(room.name);
      setIsGroupSelected(true);
    });
    socket.on("join_error", (error) => {
      alert(error.message);
      setPassword("");
      localStorage.removeItem("chat_user");
      localStorage.removeItem("chat_pass");
      socket.disconnect();
    });
    socket.on("typing", ({ from }) => {
      setTypingUsers((prev) => new Set(prev).add(from));
    });
    socket.on("stop_typing", ({ from }) => {
      setTypingUsers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(from);
        return newSet;
      });
    });
    socket.on("receive_message", (message) => {
      setMessages((prev) => [...prev, message]);

      // Update unread count if message is not for the currently selected chat
      const chatKey = message.isGroup ? message.to : message.from;
      if (chatKey !== selectedUser && message.from !== userName) {
        setUnreadCounts((prev) => ({
          ...prev,
          [chatKey]: (prev[chatKey] || 0) + 1,
        }));
      }
    });

    socket.on("unread_counts", (counts) => {
      setUnreadCounts(counts);
    });

    socket.on("message_delivered", ({ messageId }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, status: "delivered" } : msg
        )
      );
    });
    socket.on("join_room_error", ({ message }) => {
      alert(message);
    });

    socket.on("notification", ({ message, type }) => {
      // Simple alert for now, can be upgraded to toast
      alert(message);
    });
    socket.on("message_reaction_updated", ({ messageId, reactions }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          (msg.id === messageId || msg._id === messageId) ? { ...msg, reactions } : msg
        )
      );
    });

    socket.on("messages_read", ({ messageIds }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          messageIds.includes(msg.id) ? { ...msg, status: "read" } : msg
        )
      );
    });

    const handleConnect = () => {
      setIsConnected(true);
      // If we have credentials, re-join automatically (handles server restarts)
      if (userName && password) {
        socket.emit("join", { userName, password });
      }
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("receive_message");
      socket.off("users");
      socket.off("rooms");
      socket.off("message_history");
      socket.off("join_success");
      socket.off("create_room_success");
      socket.off("join_error");
      socket.off("typing");
      socket.off("stop_typing");
      socket.off("unread_counts");
      socket.off("message_delivered");
      socket.off("join_room_error");
      socket.off("notification");
      socket.off("message_reaction_updated");
      socket.off("messages_read");
    };
  }, [userName, password]); // Added userName/password to dependencies for auto-rejoin

  const sendMessage = () => {
    if (!messageText.trim() || !selectedUser) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    socket.emit("stop_typing", { from: userName, to: selectedUser, isGroup: isGroupSelected });

    socket.emit(SEND_MESSAGE, {
      userName,
      to: selectedUser,
      data: messageText,
      isGroup: isGroupSelected,
    });
    setMessageText("");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!userName || !password) return;

    if (!socket.connected) {
      socket.connect();
    }

    socket.emit("join", { userName, password });
  };

  // Auto-login on mount if credentials exist
  useEffect(() => {
    if (userName && password && !isConnected) {
      if (!socket.connected) {
        socket.connect();
      }
      socket.emit("join", { userName, password });
    }
  }, []);

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleTyping = (value = "") => {
    setMessageText(value);

    if (!selectedUser || !value?.trim()) {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      socket.emit("stop_typing", { from: userName, to: selectedUser, isGroup: isGroupSelected });
      return;
    }

    socket.emit("typing", { from: userName, to: selectedUser, isGroup: isGroupSelected });

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("stop_typing", { from: userName, to: selectedUser, isGroup: isGroupSelected });
      typingTimeoutRef.current = null;
    }, 2000);
  };

  const handleDisconnect = () => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    socket.emit("leave");
    socket.disconnect();
    setIsConnected(false);
    setUserName("");
    setPassword("");
    setSelectedUser("");
    setMessages([]);
    setUsers([]);
    setTypingUsers(new Set());
    setShowDisconnectDialog(false);
    // Clear persisted credentials on manual logout
    localStorage.removeItem("chat_user");
    localStorage.removeItem("chat_pass");
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-linear-to-br from-sky-50 via-cyan-50 to-blue-50 dark:from-gray-900 dark:via-sky-950 dark:to-cyan-950">
      {!isConnected ? (
        <AuthForm
          userName={userName}
          setUserName={setUserName}
          password={password}
          setPassword={setPassword}
          handleSubmit={handleSubmit}
        />
      ) : (
        <SidebarProvider defaultOpen={true} className="h-full">
          <ChatSidebar
            users={users}
            rooms={rooms}
            userName={userName}
            selectedUser={selectedUser}
            setSelectedUser={setSelectedUser}
            isGroupSelected={isGroupSelected}
            setIsGroupSelected={setIsGroupSelected}
            typingUsers={typingUsers}
            formatLastSeen={formatLastSeen}
            setShowDisconnectDialog={setShowDisconnectDialog}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            unreadCounts={unreadCounts}
          />
          <SidebarInset>
            {selectedUser ? (
              <ChatWindow
                selectedUser={selectedUser}
                selectedUserObj={selectedUserObj}
                selectedRoomObj={selectedRoomObj}
                isGroupSelected={isGroupSelected}
                messages={messages}
                userName={userName}
                typingUsers={typingUsers}
                formatLastSeen={formatLastSeen}
                renderMessageTicks={renderMessageTicks}
                messageText={messageText}
                handleTyping={handleTyping}
                handleKeyPress={handleKeyPress}
                sendMessage={sendMessage}
              />
            ) : (
              <>
                <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-linear-to-r from-white to-sky-50 dark:from-gray-900 dark:to-sky-950 px-4">
                  <SidebarTrigger />
                  <h2 className="font-semibold text-lg text-muted-foreground">
                    Chat App
                  </h2>
                </header>
                <div className="flex-1 flex items-center justify-center bg-linear-to-b from-sky-50/50 to-cyan-50/30 dark:from-gray-900 dark:to-sky-950/30">
                  <div className="text-center text-muted-foreground space-y-4">
                    <MessageCircle className="h-24 w-24 mx-auto opacity-20" />
                    <div>
                      <h3 className="text-xl font-semibold mb-2">
                        No Conversation Selected
                      </h3>
                      <p className="text-sm">
                        Select a user from the sidebar to start chatting
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </SidebarInset>

          <AlertDialog
            open={showDisconnectDialog}
            onOpenChange={setShowDisconnectDialog}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disconnect from chat?</AlertDialogTitle>
                <AlertDialogDescription>
                  You will be signed out and returned to the login screen. Your
                  chat history might be lost.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDisconnect}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Disconnect
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </SidebarProvider>
      )}
    </div>
  );
};

export default App;
