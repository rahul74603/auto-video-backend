import { useState, useEffect } from 'react';
import { auth } from '../firebase/config';
import { userRepository } from '@/features/users/data/userRepository';
import { entitlementRepository } from '@/features/entitlements/data/entitlementRepository';
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
            // Repository keeps the user document access separate from this access decision.
            const unsubscribe = userRepository.subscribeUser(user.uid, (userData) => {

            // रियल-टाइम लिसनर: जैसे ही एडमिन Approve करेगा, यहाँ अपने आप ताला खुल जाएगा
                if (!userData) {
                    setHasAccess(false);
                    setLoading(false);
                    return;
                }
                entitlementRepository.hasPurchasedCourse(user.uid, courseId).then((hasPurchased) => {
                    setHasAccess(userData.isPro === true || hasPurchased);
                    setLoading(false);
                }).catch((error) => {
                    console.error("Entitlement Check Error:", error);
                    setLoading(false);
                });
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