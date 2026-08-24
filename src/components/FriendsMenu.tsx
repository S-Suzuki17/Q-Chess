import React, { useState, useEffect } from 'react';
import { User } from '../types/game';
import { Friend, getFriends, sendFriendRequest, acceptFriendRequest, removeFriend, Profile, ensureProfile } from '../lib/gameRecordService';
import { dict, Language } from '../locales/dict';

interface FriendsMenuProps {
    user: User;
    lang: Language;
    onlineUsers: Set<string>;
    onClose: () => void;
    onChallenge?: (friendId: string) => void;
}

export function FriendsMenu({ user, lang, onlineUsers, onClose, onChallenge }: FriendsMenuProps) {
    const t = dict[lang];
    const [friends, setFriends] = useState<Friend[]>([]);
    const [profiles, setProfiles] = useState<Record<string, Profile>>({});
    const [loading, setLoading] = useState(true);
    const [searchId, setSearchId] = useState('');
    const [msg, setMsg] = useState('');

    const loadFriends = async () => {
        setLoading(true);
        const data = await getFriends(user.id);
        setFriends(data);
        
        // Load profiles for all friends
        const profileMap: Record<string, Profile> = {};
        for (const f of data) {
            const otherId = f.user_id === user.id ? f.friend_id : f.user_id;
            if (!profileMap[otherId]) {
                const p = await ensureProfile(otherId, 'Unknown');
                if (p) profileMap[otherId] = p;
            }
        }
        setProfiles(profileMap);
        setLoading(false);
    };

    useEffect(() => {
        loadFriends();
    }, [user.id]);

    const handleSendRequest = async () => {
        if (!searchId.trim()) return;
        if (searchId === user.id) {
            setMsg('Cannot add yourself');
            return;
        }
        // Basic check if already friends
        if (friends.some(f => f.user_id === searchId || f.friend_id === searchId)) {
            setMsg('Already friends or request pending');
            return;
        }

        const success = await sendFriendRequest(user.id, searchId);
        if (success) {
            setMsg('Request sent!');
            setSearchId('');
            loadFriends();
        } else {
            setMsg('Failed to send request. Check ID.');
        }
    };

    const handleAccept = async (friendId: string) => {
        const success = await acceptFriendRequest(user.id, friendId);
        if (success) loadFriends();
    };

    const handleRemove = async (friendId: string) => {
        const success = await removeFriend(user.id, friendId);
        if (success) loadFriends();
    };

    const acceptedFriends = friends.filter(f => f.status === 'accepted');
    const pendingRequestsMe = friends.filter(f => f.status === 'pending' && f.friend_id === user.id);
    const pendingRequestsSent = friends.filter(f => f.status === 'pending' && f.user_id === user.id);

    return (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4">
            <div className="bg-gray-900 border border-purple-500/50 p-6 rounded-lg max-w-md w-full shadow-[0_0_50px_rgba(168,85,247,0.2)] max-h-[80vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-bold text-purple-300">👥 Friends</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
                </div>

                {/* Add Friend Section */}
                <div className="mb-6 p-4 bg-black/50 border border-purple-900/50 rounded">
                    <h4 className="text-sm font-bold text-purple-400 mb-2">Add Friend</h4>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="Enter User ID (e.g. QG-...)"
                            value={searchId}
                            onChange={(e) => setSearchId(e.target.value)}
                            className="flex-1 bg-gray-900 border border-purple-800 rounded px-3 py-2 text-white focus:outline-none focus:border-purple-400 text-sm"
                        />
                        <button
                            onClick={handleSendRequest}
                            className="px-4 py-2 bg-purple-900/50 hover:bg-purple-800 border border-purple-500 rounded text-purple-300 font-bold transition-colors text-sm"
                        >
                            Send
                        </button>
                    </div>
                    {msg && <p className="text-xs text-purple-400 mt-2">{msg}</p>}
                </div>

                {/* Friend Requests (Received) */}
                {pendingRequestsMe.length > 0 && (
                    <div className="mb-6">
                        <h4 className="text-sm font-bold text-yellow-500 mb-2">Friend Requests</h4>
                        <div className="flex flex-col gap-2">
                            {pendingRequestsMe.map(req => (
                                <div key={req.id} className="flex justify-between items-center p-3 bg-yellow-950/30 border border-yellow-900/50 rounded">
                                    <span className="text-yellow-300">{profiles[req.user_id]?.name || req.user_id}</span>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleAccept(req.user_id)} className="px-3 py-1 bg-green-900/50 text-green-400 rounded text-xs border border-green-700">Accept</button>
                                        <button onClick={() => handleRemove(req.user_id)} className="px-3 py-1 bg-red-900/50 text-red-400 rounded text-xs border border-red-700">Decline</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Friends List */}
                <div>
                    <h4 className="text-sm font-bold text-purple-400 mb-2">My Friends ({acceptedFriends.length})</h4>
                    {loading ? (
                        <p className="text-gray-500 text-sm text-center py-4">Loading...</p>
                    ) : acceptedFriends.length === 0 ? (
                        <p className="text-gray-600 text-sm text-center py-4">No friends yet.</p>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {acceptedFriends.map(f => {
                                const otherId = f.user_id === user.id ? f.friend_id : f.user_id;
                                const isOnline = onlineUsers.has(otherId);
                                const profile = profiles[otherId];
                                
                                return (
                                    <div key={f.id} className="flex justify-between items-center p-3 bg-black/40 border border-purple-900/30 rounded group">
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-600'}`}></span>
                                                <span className="font-bold text-purple-200">{profile?.name || otherId}</span>
                                            </div>
                                            <span className="text-[10px] text-gray-500 ml-4">ID: {otherId}</span>
                                        </div>
                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {isOnline && onChallenge && (
                                                <button 
                                                    onClick={() => onChallenge(otherId)}
                                                    className="px-2 py-1 bg-blue-900/50 text-blue-400 rounded text-xs border border-blue-700 hover:bg-blue-800"
                                                >
                                                    Challenge
                                                </button>
                                            )}
                                            <button 
                                                onClick={() => handleRemove(otherId)}
                                                className="px-2 py-1 bg-red-900/50 text-red-400 rounded text-xs border border-red-900 hover:bg-red-800"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
