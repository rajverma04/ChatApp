import { useState, useEffect, useRef } from "react";
import socket from "../utils/socket";
import { initKeyPair, decryptMessage, clearKeyCache } from "../utils/crypto";

export const useChatSession = (userName, password, selectedUser, isGroupSelected) => {
    const [messages, setMessages] = useState([]);
    const [users, setUsers] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [isConnected, setIsConnected] = useState(false);
    const [typingUsers, setTypingUsers] = useState(new Set());
    const [unreadCounts, setUnreadCounts] = useState({});
    const [searchResults, setSearchResults] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [hasMoreMap, setHasMoreMap] = useState({});
    const [loadingMore, setLoadingMore] = useState(false);
    const typingTimeoutRef = useRef(null);

    // ─── Synchronous public-key store ─────────────────────────────────────────
    // This is a plain Map ref — updated immediately (synchronously) inside socket
    // event handlers. Unlike React state, it is readable in the SAME event loop tick,
    // so it is safe to use inside other synchronous/async socket event callbacks.
    const publicKeyMapRef = useRef(new Map()); // userName → publicKeyB64

    // Also keep a legacy ref for components still reading usersRef
    const usersRef = useRef([]);

    const searchUsers = (query) => {
        socket.emit("search_user", { query });
    };

    const loadMoreMessages = (chatKey, isGroup, beforeTimestamp) => {
        if (loadingMore) return;
        setLoadingMore(true);
        socket.emit("fetch_more_messages", { chatKey, isGroup, before: beforeTimestamp });
    };

    // ─── Decrypt helper ───────────────────────────────────────────────────────
    /**
     * Decrypt a DM message whose isEncrypted flag is true.
     * Looks up the other party's public key from:
     *   1. msg.senderPublicKey  (included by server in real-time payloads)
     *   2. publicKeyMapRef       (populated synchronously when `users` event arrives)
     * Group messages are already decrypted server-side and arrive as plaintext.
     */
    const decryptIfNeeded = async (msg) => {
        if (!msg.isEncrypted || msg.isGroup) return msg;
        try {
            const currentUser = localStorage.getItem("chat_user");
            const otherParty = msg.from === currentUser ? msg.to : msg.from;

            // Prefer the key embedded in the payload (from server), then fall back to map
            const theirPublicKey =
                msg.senderPublicKey ||                     // included by chatHandler for live msgs
                publicKeyMapRef.current.get(otherParty);  // populated by users event

            if (!theirPublicKey) {
                console.warn(`[E2E] No public key for "${otherParty}" — showing ciphertext`);
                return msg;
            }

            const plaintext = await decryptMessage(msg.message, otherParty, theirPublicKey);
            return { ...msg, message: plaintext };
        } catch (err) {
            console.error("[E2E] decryptIfNeeded failed:", err);
            return msg;
        }
    };

    const decryptBatch = (msgs) => Promise.all(msgs.map(decryptIfNeeded));

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
        const handleReceiveMessage = async (message) => {
            const decrypted = await decryptIfNeeded(message);
            setMessages((prev) => [...prev, decrypted]);
            const chatKey = message.isGroup ? message.to : message.from;
            setUnreadCounts((prev) => {
                if (message.from === localStorage.getItem("chat_user")) return prev;
                return { ...prev, [chatKey]: (prev[chatKey] || 0) + 1 };
            });
        };

        // ── Users handler ──────────────────────────────────────────────────────
        // IMPORTANT: update publicKeyMapRef SYNCHRONOUSLY before calling setUsers,
        // so subsequent socket event handlers (message_history, receive_message) can
        // immediately read fresh public keys without waiting for a React re-render.
        const handleUsers = (userList) => {
            userList.forEach(u => {
                if (u.publicKey) publicKeyMapRef.current.set(u.name, u.publicKey);
            });
            usersRef.current = userList;
            setUsers(userList);
        };

        // message_history arrives as { messages, hasMore }
        const handleMessageHistory = async (payload) => {
            const msgList = Array.isArray(payload) ? payload : payload.messages;
            const more = Array.isArray(payload) ? false : !!payload.hasMore;

            const decrypted = await decryptBatch(msgList);
            setMessages(decrypted);

            const currentUser = localStorage.getItem("chat_user");
            const keysMore = new Map();
            msgList.forEach((m) => {
                const key = m.isGroup ? m.to : (m.from === currentUser ? m.to : m.from);
                if (!keysMore.has(key)) keysMore.set(key, more);
                else if (more) keysMore.set(key, true);
            });
            if (keysMore.size > 0) {
                setHasMoreMap((prev) => {
                    const next = { ...prev };
                    keysMore.forEach((val, key) => { next[key] = val; });
                    return next;
                });
            }
        };

        // more_messages arrives after fetch_more_messages request
        const handleMoreMessages = async ({ messages: newMsgs, hasMore, chatKey }) => {
            setLoadingMore(false);
            if (!newMsgs || newMsgs.length === 0) {
                setHasMoreMap((prev) => ({ ...prev, [chatKey]: false }));
                return;
            }
            const decrypted = await decryptBatch(newMsgs);
            setMessages((prev) => {
                const existingIds = new Set(prev.map((m) => m.id));
                const unique = decrypted.filter((m) => !existingIds.has(m.id));
                return [...unique, ...prev];
            });
            setHasMoreMap((prev) => ({ ...prev, [chatKey]: hasMore }));
        };

        socket.on("receive_message", handleReceiveMessage);
        socket.on("users", handleUsers);       // replaces the plain setUsers
        socket.on("rooms", setRooms);
        socket.on("message_history", handleMessageHistory);
        socket.on("more_messages", handleMoreMessages);
        socket.on("unread_counts", setUnreadCounts);
        socket.on("typing", ({ from }) => setTypingUsers((prev) => new Set(prev).add(from)));
        socket.on("stop_typing", ({ from }) => setTypingUsers((prev) => {
            const next = new Set(prev);
            next.delete(from);
            return next;
        }));
        socket.on("message_delivered", ({ messageId }) =>
            setMessages((prev) =>
                prev.map((msg) => msg.id === messageId ? { ...msg, status: "delivered" } : msg)
            )
        );
        socket.on("message_reaction_updated", ({ messageId, reactions }) =>
            setMessages((prev) =>
                prev.map((msg) =>
                    (msg.id === messageId || msg._id === messageId) ? { ...msg, reactions } : msg
                )
            )
        );
        socket.on("messages_read", ({ messageIds }) =>
            setMessages((prev) =>
                prev.map((msg) => messageIds.includes(msg.id) ? { ...msg, status: "read" } : msg)
            )
        );
        socket.on("join_success", async () => {
            setIsConnected(true);
            try {
                const { publicKeyB64 } = await initKeyPair();
                // Store our own key too (for self-DM edge-cases)
                const me = localStorage.getItem("chat_user");
                if (me) publicKeyMapRef.current.set(me, publicKeyB64);
                socket.emit("register_public_key", { publicKey: publicKeyB64 });
            } catch (err) {
                console.error("[E2E] Key init failed:", err);
            }
        });
        socket.on("join_error", () => {
            setIsConnected(false);
            localStorage.removeItem("chat_user");
            localStorage.removeItem("chat_pass");
        });
        socket.on("search_results", (results) => {
            // Also seed publicKeyMap from search results
            results.forEach(u => {
                if (u.publicKey) publicKeyMapRef.current.set(u.name, u.publicKey);
            });
            setSearchResults(results);
        });
        socket.on("notification", (notif) => {
            setNotifications(prev => [{ ...notif, id: Date.now() }, ...prev]);
        });
        socket.on("username_changed", ({ newName }) => {
            localStorage.setItem("chat_user", newName);
            clearKeyCache();
            window.location.reload();
        });

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

        if (socket.connected) handleConnect();

        return () => {
            socket.off("receive_message", handleReceiveMessage);
            socket.off("users", handleUsers);
            socket.off("rooms");
            socket.off("message_history", handleMessageHistory);
            socket.off("more_messages", handleMoreMessages);
            socket.off("unread_counts");
            socket.off("typing");
            socket.off("stop_typing");
            socket.off("message_delivered");
            socket.off("message_reaction_updated");
            socket.off("messages_read");
            socket.off("join_success");
            socket.off("join_error");
            socket.off("search_results");
            socket.off("notification");
            socket.off("username_changed");
            socket.off("connect", handleConnect);
            socket.off("disconnect", handleDisconnect);
        };
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
        searchResults,
        setSearchResults,
        searchUsers,
        notifications,
        clearNotification: (id) => setNotifications(prev => prev.filter(n => n.id !== id)),
        loadMoreMessages,
        hasMoreMap,
        loadingMore,
        usersRef,
    };
};
