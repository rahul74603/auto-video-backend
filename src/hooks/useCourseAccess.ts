import { useState, useEffect } from 'react';
import { auth } from '../firebase/config';
import { userRepository } from '@/features/users/data/userRepository';
import { entitlementRepository } from '@/features/entitlements/data/entitlementRepository';
import { onAuthStateChanged } from 'firebase/auth';

export const useCourseAccess = (courseId: string) => {
    const [hasAccess, setHasAccess] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        let unsubscribeUser: (() => void) | null = null;
        const resetTimer = setTimeout(() => {
            if (!cancelled) {
                setLoading(true);
                setHasAccess(false);
            }
        }, 0);

        const authUnsubscribe = onAuthStateChanged(auth, (user) => {
            clearTimeout(resetTimer);
            // onAuthStateChanged ignores callback return values. Explicitly clean
            // the previous user listener when the course/auth state changes.
            unsubscribeUser?.();
            unsubscribeUser = null;
            if (cancelled) return;

            if (!user) {
                setHasAccess(false);
                setLoading(false);
                return;
            }

            if (!courseId) {
                setHasAccess(false);
                setLoading(false);
                return;
            }

            const ADMIN_EMAIL = "rahul74603@gmail.com";
            if (user.email === ADMIN_EMAIL) {
                setHasAccess(true);
                setLoading(false);
                return;
            }

            unsubscribeUser = userRepository.subscribeUser(user.uid, (userData) => {
                if (cancelled) return;
                if (!userData) {
                    setHasAccess(false);
                    setLoading(false);
                    return;
                }
                entitlementRepository.hasPurchasedCourse(user.uid, courseId).then((hasPurchased) => {
                    if (cancelled) return;
                    setHasAccess(userData.isPro === true || hasPurchased);
                    setLoading(false);
                }).catch((error) => {
                    if (cancelled) return;
                    console.error("Entitlement Check Error:", error);
                    setLoading(false);
                });
            }, (error) => {
                if (cancelled) return;
                console.error("Access Check Error:", error);
                setLoading(false);
            });
        });

        return () => {
            cancelled = true;
            clearTimeout(resetTimer);
            unsubscribeUser?.();
            authUnsubscribe();
        };
    }, [courseId]);

    const buyCourse = (paymentLink: string) => {
        if (!paymentLink) {
            alert("Payment link is missing!");
            return;
        }
        window.location.href = paymentLink;
    };

    return { hasAccess, loading, buyCourse };
};
