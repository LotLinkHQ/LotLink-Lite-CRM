import React, { createContext, useContext, useEffect, useState } from "react";
import { useDealershipAuth } from "@/hooks/use-dealership-auth";
import { trpc } from "@/lib/trpc";

interface Branding {
    primaryColor: string;
    logoUrl?: string;
    showPoweredBy: boolean;
    name: string;
}

const DEFAULT_BRANDING: Branding = {
    primaryColor: "#0B5E7E", // LotLink Blue
    showPoweredBy: false,
    name: "LotLink",
};

interface BrandContextType {
    branding: Branding;
    isLoading: boolean;
}

const BrandContext = createContext<BrandContextType>({
    branding: DEFAULT_BRANDING,
    isLoading: true,
});

export function BrandProvider({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, user } = useDealershipAuth();
    const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);

    // Fetch dealership details if authenticated and linked
    const { data: dealershipData, isLoading } = trpc.dealership.get.useQuery(undefined, {
        enabled: !!isAuthenticated && !!user?.dealershipId,
        retry: false,
    });

    useEffect(() => {
        if (dealershipData) {
            const dbBranding = (dealershipData as any).branding;
            if (dbBranding) {
                setBranding({
                    primaryColor: dbBranding.primaryColor || DEFAULT_BRANDING.primaryColor,
                    logoUrl: dbBranding.logoUrl,
                    showPoweredBy: dbBranding.showPoweredBy ?? true,
                    name: dealershipData.name,
                });
            } else {
                setBranding({
                    ...DEFAULT_BRANDING,
                    name: dealershipData.name
                });
            }
        } else {
            setBranding(DEFAULT_BRANDING);
        }
    }, [dealershipData]);

    return (
        <BrandContext.Provider value={{ branding, isLoading }}>
            {children}
        </BrandContext.Provider>
    );
}

export const useBrand = () => useContext(BrandContext);
