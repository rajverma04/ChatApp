import { useState, useEffect, useRef } from "react";
import socket from "../utils/socket";

export const useChatSession = (userName, password, selectedUser, isGroupSelected) => {
    const [messages, setMessages] = useState([]);
    const [users, setUsers] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [isConnected, setIsConnected] = useState(false);
    const [typingUsers, setTypingUsers] = useState(new Set());
    const [unreadCounts, setUnreadCounts] = useState({});
    const typingTimeoutRef = useRef(null);

    // Mark room/DM as read when user switches to it
    useEffect(() => {
        if (selectedUser && isConnected) {
            if (isGroupSelected) {
                socket.emit("mark_room_read", { roomName: selectedUser });
            } else {
                socket.emit("messages_read", { from: selectedUser, to: userName });
            }
            setUnreadCounts((prev) => {
                if (!prev[selectedUser]) return prev;
                const next = { ...prev };
                delete next[selectedUser];
                return next;
            });
        }
    }, [selectedUser, isConnected, isGroupSelected]);

    // Register all socket event listeners once on mount
    useEffect(() => {
        const handleReceiveMessage = (message) => {
            setMessages((prev) => [...prev, message]);
            const chatKey = message.isGroup ? message.to : message.from;
            // Use ref snapshot of selectedUser to avoid stale closures
            setUnreadCounts((prev) => {
                const currentChatKey = chatKey;
                // We can't access selectedUser here directly without a ref,
                // so we update the count and let the read-effect handle clearing
                if (message.from === localStorage.getItem("chat_user")) return prev;
                return {
                    ...prev,
                    [currentChatKey]: (prev[currentChatKey] || 0) + 1,
                };
            });
        };

        socket.on("receive_message", handleReceiveMessage);
        socket.on("users", setUsers);
        socket.on("rooms", setRooms);
        socket.on("message_history", setMessages);
        socket.on("unread_counts", setUnreadCounts);
        socket.on("typing", ({ from }) => setTypingUsers((prev) => new Set(prev).add(from)));
        socket.on("stop_typing", ({ from }) => setTypingUsers((prev) => {
            const next = new Set(prev);
            next.delete(from);
            return next;
        }));
        socket.on("message_delivered", ({ messageId }) =>
            setMessages((prev) => prev.map((msg) =>
                msg.id === messageId ? { ...msg, status: "delivered" } : msg
            ))
        );
        socket.on("message_reaction_updated", ({ messageId, reactions }) =>
            setMessages((prev) => prev.map((msg) =>
                (msg.id === messageId || msg._id === messageId) ? { ...msg, reactions } : msg
            ))
        );
        socket.on("messages_read", ({ messageIds }) =>
            setMessages((prev) => prev.map((msg) =>
                messageIds.includes(msg.id) ? { ...msg, status: "read" } : msg
            ))
        );
        socket.on("join_success", ({ userName: joinedUser, password: joinedPass } = {}) => {
            setIsConnected(true);
        });
        socket.on("join_error", () => {
            setIsConnected(false);
            localStorage.removeItem("chat_user");
            localStorage.removeItem("chat_pass");
        });

        // Auto-rejoin on socket (re)connect using ONLY stored credentials.
        // This handles page refresh. Manual login is handled by handleSubmit in App.jsx.
        const handleConnect = () => {
            const storedUser = localStorage.getItem("chat_user");
            const storedPass = localStorage.getItem("chat_pass");
            if (storedUser && storedPass) {
                socket.emit("join", { userName: storedUser, password: storedPass });
            }
        };
        const handleDisconnect = () => setIsConnected(false);

        socket.on("connect", handleConnect);
        socket.on("disconnect", handleDisconnect);

        // If socket is already connected on mount (e.g. after HMR), fire immediately
        if (socket.connected) {
            handleConnect();
        }

        return () => {
            socket.off("receive_message", handleReceiveMessage);
            socket.off("users");
            socket.off("rooms");
            socket.off("message_history");
            socket.off("unread_counts");
            socket.off("typing");
            socket.off("stop_typing");
            socket.off("message_delivered");
            socket.off("message_reaction_updated");
            socket.off("messages_read");
            socket.off("join_success");
            socket.off("join_error");
            socket.off("connect", handleConnect);
            socket.off("disconnect", handleDisconnect);
        };
        // Empty deps: register event handlers once; auto-rejoin reads from localStorage at call time.
    }, []);

    return {
        messages,
        setMessages,
        users,
        rooms,
        isConnected,
        setIsConnected,
        typingUsers,
        unreadCounts,
        setUnreadCounts,
        typingTimeoutRef,
    };
};
