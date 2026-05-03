// @ts-nocheck
import { useState, useEffect } from 'react';
import { db, auth } from '../firebase/config';
import { doc, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

export const useCourseAccess = (courseId: string) => {
    const [hasAccess, setHasAccess] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Auth state change ka intezar karein taki user mil sake
        const authUnsubscribe = onAuthStateChanged(auth, (user) => {
            if (!user) {
                setHasAccess(false);
                setLoading(false);
                return;
            }

            if (!courseId) {
                setLoading(false);
                return;
            }

            // 1. अगर आप (Admin) हैं तो हमेशा फुल एक्सेस मिलेगा
            // अपनी असली एडमिन ईमेल यहाँ डाल सकते हैं या ENV से ले सकते हैं
            const ADMIN_EMAIL = "rahul74603@gmail.com"; // 👈 अपनी असली ईमेल यहाँ डालें
            if (user.email === ADMIN_EMAIL) {
                setHasAccess(true);
                setLoading(false);
                return;
            }

            // 2. 'users' कलेक्शन में यूजर का डॉक्यूमेंट चेक करना
            const userDocRef = doc(db, 'users', user.uid);

            // रियल-टाइम लिसनर: जैसे ही एडमिन Approve करेगा, यहाँ अपने आप ताला खुल जाएगा
            const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
                if (docSnap.exists()) {
                    const userData = docSnap.data();
                    
                    // 🔥 NEW LOGIC: isPro check karein ya specific course check karein
                    const purchasedKey = `purchased_${courseId}`;
                    if (userData.isPro === true || userData[purchasedKey] === true) {
                        setHasAccess(true);
                    } else {
                        setHasAccess(false);
                    }
                } else {
                    setHasAccess(false);
                }
                setLoading(false);
            }, (error) => {
                console.error("Access Check Error:", error);
                setLoading(false);
            });

            return () => unsubscribe();
        });

        return () => authUnsubscribe();
    }, [courseId]);

    // पेमेंट पर भेजने वाला फंक्शन
    const buyCourse = (paymentLink: string) => {
        if (!paymentLink) {
            alert("Payment link is missing!");
            return;
        }
        window.location.href = paymentLink;
    };

    return { hasAccess, loading, buyCourse };
};