import { useState } from "react";
import socket from "../../utils/socket";
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarFooter,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarRail,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import UserProfileModal from "./UserProfileModal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MessageCircle, LogOut, Search, Plus, Users, Lock, Compass, Bell, Check, X, UserCog } from "lucide-react";

const ChatSidebar = ({
    users,
    rooms,
    userName,
    selectedUser,
    setSelectedUser,
    isGroupSelected,
    setIsGroupSelected,
    typingUsers,
    formatLastSeen,
    setShowDisconnectDialog,
    searchQuery,
    setSearchQuery,
    unreadCounts,
    searchResults = [],
    searchUsers,
    notifications = [],
    clearNotification,
}) => {
    const [newRoomName, setNewRoomName] = useState("");
    const [newRoomDescription, setNewRoomDescription] = useState("");
    const [isPrivate, setIsPrivate] = useState(false);
    const [isCreateRoomOpen, setIsCreateRoomOpen] = useState(false);
    const [isDiscoverOpen, setIsDiscoverOpen] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [dmSearch, setDmSearch] = useState("");
    const [showDmSearch, setShowDmSearch] = useState(false);

    // Filter rooms into joined and discoverable
    const joinedRooms = (rooms || []).filter((r) => (r.members || []).includes(userName));
    const discoverableRooms = (rooms || []).filter((r) => !(r.members || []).includes(userName));

    // Rooms where user is creator and has pending requests
    const roomsWithRequests = joinedRooms.filter(r => r.createdBy === userName && r.pendingRequests?.length > 0);

    const filteredUsers = users.filter((u) =>
        u.name !== userName &&
        u.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredJoinedRooms = joinedRooms.filter((r) =>
        r.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredDiscoverableRooms = discoverableRooms.filter((r) =>
        r.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleCreateRoom = () => {
        if (newRoomName.trim().length >= 3) {
            socket.emit("create_room", {
                roomName: newRoomName.trim(),
                description: newRoomDescription.trim(),
                members: [userName],
                isPrivate: isPrivate,
                createdBy: userName
            });
            setNewRoomName("");
            setNewRoomDescription("");
            setIsPrivate(false);
            setIsCreateRoomOpen(false);
        }
    };

    const handleSelectUser = (name) => {
        setSelectedUser(name);
        setIsGroupSelected(false);
    };

    const handleSelectRoom = (name) => {
        setSelectedUser(name);
        setIsGroupSelected(true);
        socket.emit("join_room", { roomName: name });
    };

    const handleJoinRequest = (roomName, isPrivateRoom) => {
        if (isPrivateRoom) {
            socket.emit("request_join", { roomName });
        } else {
            socket.emit("join_room", { roomName });
        }
    };

    const handleApprove = (roomName, user) => {
        socket.emit("approve_join", { roomName, userName: user });
    };

    const handleDecline = (roomName, user) => {
        socket.emit("decline_join", { roomName, userName: user });
    };

    return (
        <>
            <Sidebar collapsible="icon" variant="inset" className="border-r">
                <SidebarHeader className="border-b bg-linear-to-r from-sky-600 to-cyan-600 text-white">
                    <div className="flex items-center gap-2 px-2 py-2">
                        <MessageCircle className="h-5 w-5" />
                        <span className="font-semibold text-lg group-data-[collapsible=icon]:hidden">
                            Chats
                        </span>
                    </div>
                </SidebarHeader>
                <SidebarContent>
                    {/* Notification banners */}
                    {notifications.length > 0 && (
                        <div className="px-3 pt-2 space-y-1.5 group-data-[collapsible=icon]:hidden">
                            {notifications.map(n => (
                                <div key={n.id} className={`flex items-start gap-2 px-3 py-2 rounded-xl text-xs border shadow-sm ${n.type === 'join_request' ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                                        : n.type === 'join_approved' ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                                            : 'bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-200'
                                    }`}>
                                    <Bell className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                    <span className="flex-1 leading-tight">{n.message}</span>
                                    <button onClick={() => clearNotification?.(n.id)} className="ml-1 shrink-0 opacity-60 hover:opacity-100"><X className="h-3 w-3" /></button>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="px-4 py-3 group-data-[collapsible=icon]:hidden">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="search"
                                placeholder="Search..."
                                className="pl-9 h-9 bg-sky-50/50 dark:bg-sky-950/20 border-sky-100 dark:border-sky-900"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    <SidebarGroup>
                        <div className="flex items-center justify-between pr-2 mb-1 group-data-[collapsible=icon]:hidden">
                            <SidebarGroupLabel className="pt-0">Rooms</SidebarGroupLabel>
                            <Dialog open={isCreateRoomOpen} onOpenChange={setIsCreateRoomOpen}>
                                <div className="flex gap-1">
                                    <DialogTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-sky-600 hover:text-sky-700 hover:bg-sky-50" title="Create Room">
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </DialogTrigger>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-sky-600 hover:text-sky-700 hover:bg-sky-50"
                                        onClick={() => setIsDiscoverOpen(true)}
                                        title="Discover Rooms"
                                    >
                                        <Compass className="h-4 w-4" />
                                    </Button>
                                </div>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Create New Room</DialogTitle>
                                        <DialogDescription>
                                            Create a space for group discussions.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Room Name</label>
                                            <Input
                                                placeholder="e.g. Project Team"
                                                value={newRoomName}
                                                onChange={(e) => setNewRoomName(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Description (Optional)</label>
                                            <Input
                                                placeholder="What's this room about?"
                                                value={newRoomDescription}
                                                onChange={(e) => setNewRoomDescription(e.target.value)}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between space-x-2 pt-2">
                                            <div className="flex flex-col space-y-1">
                                                <Label htmlFor="private-room" className="font-semibold">Private Room</Label>
                                                <p className="text-[11px] text-muted-foreground">Only members can see and join this room.</p>
                                            </div>
                                            <Switch
                                                id="private-room"
                                                checked={isPrivate}
                                                onCheckedChange={setIsPrivate}
                                            />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button variant="outline" onClick={() => setIsCreateRoomOpen(false)}>
                                            Cancel
                                        </Button>
                                        <Button
                                            onClick={handleCreateRoom}
                                            disabled={newRoomName.trim().length < 3}
                                            className="bg-sky-600 hover:bg-sky-700"
                                        >
                                            Create Room
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {filteredJoinedRooms.length === 0 ? (
                                    <div className="p-4 text-center text-muted-foreground text-xs group-data-[collapsible=icon]:hidden italic">
                                        {searchQuery ? "No rooms found" : "No rooms joined"}
                                    </div>
                                ) : (
                                    filteredJoinedRooms.map((room) => (
                                        <SidebarMenuItem key={room.name}>
                                            <SidebarMenuButton
                                                onClick={() => handleSelectRoom(room.name)}
                                                isActive={selectedUser === room.name && isGroupSelected}
                                                className="h-auto py-3 group-data-[collapsible=icon]:justify-center"
                                                tooltip={room.name}
                                            >
                                                <div className="relative shrink-0">
                                                    <Avatar className="h-9 w-9">
                                                        <AvatarFallback className="bg-linear-to-br from-indigo-500 to-purple-600 text-white font-semibold text-sm">
                                                            <Users className="h-4 w-4" />
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    {unreadCounts?.[room.name] > 0 && (
                                                        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white border-2 border-white dark:border-gray-800 z-10 shadow-md">
                                                            {unreadCounts[room.name]}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex flex-col items-start group-data-[collapsible=icon]:hidden">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-semibold text-sm">
                                                            {room.name}
                                                        </span>
                                                        {room.isPrivate && <Lock className="h-3 w-3 text-sky-600" />}
                                                    </div>
                                                    <span className="text-xs text-muted-foreground">
                                                        {room.members?.length || 0} members
                                                    </span>
                                                </div>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    ))
                                )}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>

                    {/* Admin/Creator Panel: Pending Requests */}
                    {roomsWithRequests.length > 0 && (
                        <SidebarGroup>
                            <SidebarGroupLabel className="flex items-center gap-2 text-amber-600 font-bold group-data-[collapsible=icon]:hidden">
                                <Bell className="h-3 w-3" />
                                Join Requests
                            </SidebarGroupLabel>
                            <SidebarGroupContent>
                                <SidebarMenu>
                                    {roomsWithRequests.map(room => (
                                        <div key={room.name} className="px-3 pb-2 space-y-1">
                                            <div className="text-[10px] font-bold text-muted-foreground flex items-center justify-between">
                                                <span>{room.name}</span>
                                                <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">{room.pendingRequests.length}</span>
                                            </div>
                                            {room.pendingRequests.map(u => (
                                                <div key={u} className="flex items-center justify-between gap-1 bg-white/50 dark:bg-sky-900/10 p-2 rounded-lg border border-sky-100/50 dark:border-sky-900/50 group-data-[collapsible=icon]:flex-col">
                                                    <span className="text-xs font-medium truncate">{u}</span>
                                                    <div className="flex gap-1 shrink-0">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                                            onClick={() => handleApprove(room.name, u)}
                                                        >
                                                            <Check className="h-3.5 w-3.5" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6 text-red-600 hover:text-red-700 hover:bg-red-50"
                                                            onClick={() => handleDecline(room.name, u)}
                                                        >
                                                            <X className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </SidebarMenu>
                            </SidebarGroupContent>
                        </SidebarGroup>
                    )}

                    <SidebarGroup>
                        <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden flex items-center justify-between pr-2">
                            <span>Direct Messages</span>
                            <button
                                onClick={() => setShowDmSearch(v => !v)}
                                className="text-muted-foreground hover:text-sky-600 transition-colors"
                                title="Find user"
                            >
                                <Plus className="h-3.5 w-3.5" />
                            </button>
                        </SidebarGroupLabel>
                        {showDmSearch && (
                            <div className="px-2 pb-2 group-data-[collapsible=icon]:hidden">
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                                    <Input
                                        value={dmSearch}
                                        onChange={(e) => { setDmSearch(e.target.value); searchUsers?.(e.target.value); }}
                                        placeholder="Search by username…"
                                        className="pl-8 h-8 text-xs rounded-xl border-sky-100 dark:border-sky-900"
                                    />
                                </div>
                                {dmSearch && searchResults.length > 0 && (
                                    <div className="mt-1 space-y-0.5">
                                        {searchResults.map(r => (
                                            <button
                                                key={r.name}
                                                onClick={() => { handleSelectUser(r.name); setShowDmSearch(false); setDmSearch(""); }}
                                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors text-left"
                                            >
                                                <div className="relative shrink-0">
                                                    <Avatar className="h-7 w-7">
                                                        <AvatarImage src={r.avatar} alt={r.name} className="object-cover" />
                                                        <AvatarFallback className="text-xs bg-sky-100 text-sky-700">{r.name.charAt(0).toUpperCase()}</AvatarFallback>
                                                    </Avatar>
                                                    {r.online && <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-500 border border-white rounded-full" />}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-medium">{r.name}</span>
                                                    {r.bio && <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">{r.bio}</span>}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {dmSearch && searchResults.length === 0 && (
                                    <p className="text-xs text-muted-foreground text-center py-2">No users found</p>
                                )}
                            </div>
                        )}
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {filteredUsers.length === 0 ? (
                                    <div className="p-4 text-center text-muted-foreground text-xs group-data-[collapsible=icon]:hidden italic">
                                        {searchQuery ? "No contacts found" : "No contacts yet — search above to start a DM"}
                                    </div>
                                ) : (
                                    filteredUsers.map((user) => (
                                        <SidebarMenuItem key={user.name}>
                                            <SidebarMenuButton
                                                onClick={() => handleSelectUser(user.name)}
                                                isActive={selectedUser === user.name && !isGroupSelected}
                                                className="h-auto py-3 group-data-[collapsible=icon]:justify-center"
                                                tooltip={user.name}
                                            >
                                                <div className="relative shrink-0">
                                                    <Avatar className="h-9 w-9">
                                                        <AvatarImage src={user.avatar} alt={user.name} className="object-cover" />
                                                        <AvatarFallback className={`${user.online
                                                            ? "bg-linear-to-br from-sky-500 to-cyan-500"
                                                            : "bg-linear-to-br from-gray-400 to-gray-500"
                                                            } text-white font-semibold text-sm`}>
                                                            {user.name.charAt(0).toUpperCase()}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    {unreadCounts?.[user.name] > 0 && (
                                                        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white border-2 border-white dark:border-gray-800 z-10 shadow-md">
                                                            {unreadCounts[user.name]}
                                                        </span>
                                                    )}
                                                    {user.online && (
                                                        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 border-2 border-white dark:border-gray-800 rounded-full z-10 ${user.status === "Busy" ? "bg-red-500" :
                                                            user.status === "Working" ? "bg-yellow-400" :
                                                                user.status === "Away" ? "bg-gray-400" :
                                                                    "bg-emerald-500"
                                                            }`} />
                                                    )}
                                                </div>
                                                <div className="flex flex-col items-start group-data-[collapsible=icon]:hidden">
                                                    <span className="font-semibold text-sm">
                                                        {user.name}
                                                    </span>
                                                    {user.online ? (
                                                        typingUsers?.has?.(user.name) ? (
                                                            <span className="text-xs text-sky-600 dark:text-sky-400 font-medium flex items-center gap-1">
                                                                typing...
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                                                                ● Online
                                                            </span>
                                                        )
                                                    ) : (
                                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                                            {formatLastSeen(user.lastSeen)}
                                                        </span>
                                                    )}
                                                </div>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    ))
                                )}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                </SidebarContent>
                {/* Discover Rooms Dialog */}
                <Dialog open={isDiscoverOpen} onOpenChange={setIsDiscoverOpen}>
                    <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Compass className="h-5 w-5 text-sky-600" />
                                Discover Rooms
                            </DialogTitle>
                            <DialogDescription>
                                Find and join new group discussions.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex-1 overflow-hidden flex flex-col gap-4 py-4">
                            <div className="relative mx-1">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search available rooms..."
                                    className="pl-9"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                                {filteredDiscoverableRooms.length === 0 ? (
                                    <div className="text-center py-10 text-muted-foreground">
                                        <Users className="h-10 w-10 mx-auto opacity-20 mb-2" />
                                        <p>No new rooms available to join.</p>
                                    </div>
                                ) : (
                                    filteredDiscoverableRooms.map(room => (
                                        <div key={room.name} className="flex items-center justify-between p-4 bg-sky-50/50 dark:bg-sky-950/20 rounded-xl border border-sky-100 dark:border-sky-900 shadow-xs">
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-10 w-10">
                                                    <AvatarFallback className="bg-linear-to-br from-indigo-500 to-purple-600 text-white">
                                                        <Users className="h-5 w-5" />
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-bold">{room.name}</span>
                                                        {room.isPrivate && <Lock className="h-3 w-3 text-sky-600" />}
                                                    </div>
                                                    <span className="text-xs text-muted-foreground line-clamp-1">{room.description || "No description"}</span>
                                                    <span className="text-[10px] text-sky-600 font-medium">{room.members?.length || 0} members</span>
                                                </div>
                                            </div>
                                            <div>
                                                {room.pendingRequests?.includes(userName) ? (
                                                    <Button variant="outline" disabled className="text-amber-600 bg-amber-50">
                                                        Pending Approval
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        onClick={() => handleJoinRequest(room.name, room.isPrivate)}
                                                        className="bg-sky-600 hover:bg-sky-700"
                                                    >
                                                        {room.isPrivate ? "Request Access" : "Join Room"}
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
                <SidebarFooter className="border-t bg-linear-to-r from-sky-50 to-cyan-50 dark:from-gray-800 dark:to-sky-900 p-4">
                    <SidebarMenu>
                        {/* Edit Profile */}
                        <SidebarMenuItem>
                            <SidebarMenuButton
                                onClick={() => setShowProfileModal(true)}
                                className="h-auto py-2 mb-1 hover:bg-sky-100/50 dark:hover:bg-sky-900/20 group-data-[collapsible=icon]:justify-center"
                                tooltip="Edit Profile"
                            >
                                <UserCog className="h-4 w-4 text-sky-600 shrink-0" />
                                <span className="text-xs font-medium text-sky-600 group-data-[collapsible=icon]:hidden">Edit Profile</span>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                        {/* Current User / Disconnect */}
                        <SidebarMenuItem>
                            <SidebarMenuButton
                                onClick={() => setShowDisconnectDialog(true)}
                                className="h-11 hover:bg-destructive/10 group-data-[collapsible=icon]:justify-center"
                                tooltip="Disconnect"
                            >
                                <Avatar className="h-9 w-9 shrink-0">
                                    <AvatarImage src={users.find(u => u.name === userName)?.avatar} alt={userName} className="object-cover" />
                                    <AvatarFallback className="bg-linear-to-br from-cyan-600 to-sky-600 text-white font-semibold text-sm">
                                        {userName.charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <LogOut className="h-5 w-5 text-red-600 dark:text-red-400 hidden group-data-[collapsible=icon]:block" />
                                <div className="flex flex-col items-start group-data-[collapsible=icon]:hidden">
                                    <span className="font-semibold text-sm">{userName}</span>
                                    <span className="text-xs text-muted-foreground">Click to disconnect</span>
                                </div>
                                <LogOut className="ml-auto h-4 w-4 text-red-600 dark:text-red-400 group-data-[collapsible=icon]:hidden" />
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarFooter>
                <SidebarRail />
            </Sidebar>
            {/* User Profile Modal */}
            <UserProfileModal
                open={showProfileModal}
                onClose={() => setShowProfileModal(false)}
                currentUser={users.find(u => u.name === userName) || { name: userName }}
            />
        </>
    );
};

export default ChatSidebar;
