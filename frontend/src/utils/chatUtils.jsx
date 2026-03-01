import React from 'react';

// Helper function to format last seen time
export const formatLastSeen = (lastSeenISO) => {
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
export const renderMessageTicks = (status) => {
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
