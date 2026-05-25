(function () {
    "use strict";

    document.documentElement.classList.add("motion-ready");

    const header = document.getElementById("siteHeader");
    const navToggle = document.getElementById("navToggle");
    const navLinks = document.querySelectorAll("#primaryNavigation a");
    const refreshButton = document.getElementById("refreshBtn");
    const loading = document.getElementById("loading");
    const errorPanel = document.getElementById("error");
    const errorMessage = document.getElementById("errorMessage");
    const dashboard = document.getElementById("dashboard");
    const intelligenceSection = document.getElementById("intelligence");
    const dateRange = document.getElementById("dateRange");
    const proxyUrl = "https://patmossecurity.vercel.app/api/nvd";
    const pageSize = 2000;
    let chartInstances = [];
    let activeRequest = null;
    let intelligenceRequested = false;

    function updateHeader() {
        header.classList.toggle("is-scrolled", window.scrollY > 16);
    }

    function closeNavigation() {
        header.classList.remove("is-open");
        document.body.classList.remove("nav-open");
        navToggle.setAttribute("aria-expanded", "false");
        navToggle.setAttribute("aria-label", "Abrir menu");
    }

    navToggle.addEventListener("click", function () {
        const open = !header.classList.contains("is-open");
        header.classList.toggle("is-open", open);
        document.body.classList.toggle("nav-open", open);
        navToggle.setAttribute("aria-expanded", String(open));
        navToggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
    });

    navLinks.forEach(function (link) {
        link.addEventListener("click", closeNavigation);
    });

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") closeNavigation();
    });

    window.addEventListener("resize", function () {
        if (window.innerWidth > 820) closeNavigation();
    });

    window.addEventListener("scroll", updateHeader, { passive: true });
    updateHeader();

    const revealItems = document.querySelectorAll("[data-reveal]");
    if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add("is-visible");
                    observer.unobserve(entry.target);
                }
            });
        }, { rootMargin: "0px 0px -9% 0px", threshold: 0.08 });

        revealItems.forEach(function (element) {
            observer.observe(element);
        });
    } else {
        revealItems.forEach(function (element) {
            element.classList.add("is-visible");
        });
    }

    function formatNumber(number) {
        return number.toLocaleString("pt-BR");
    }

    function getSeverity(vulnerability) {
        const metrics = vulnerability.cve.metrics || {};
        if (metrics.cvssMetricV31) {
            return metrics.cvssMetricV31[0].cvssData.baseSeverity;
        }
        if (metrics.cvssMetricV30) {
            return metrics.cvssMetricV30[0].cvssData.baseSeverity;
        }
        if (metrics.cvssMetricV2) {
            const score = metrics.cvssMetricV2[0].cvssData.baseScore;
            if (score >= 9) return "CRITICAL";
            if (score >= 7) return "HIGH";
            if (score >= 4) return "MEDIUM";
            return "LOW";
        }
        return "NONE";
    }

    function processVulnerabilities(vulnerabilities, totalResults) {
        const dailyCounts = {};
        const monthlyCounts = {};
        const severityCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, NONE: 0 };

        vulnerabilities.forEach(function (vulnerability) {
            const publication = new Date(vulnerability.cve.published);
            if (Number.isNaN(publication.getTime())) return;
            const dayKey = publication.toISOString().slice(0, 10);
            const monthKey = dayKey.slice(0, 7);
            const severity = getSeverity(vulnerability);

            dailyCounts[dayKey] = (dailyCounts[dayKey] || 0) + 1;
            monthlyCounts[monthKey] = (monthlyCounts[monthKey] || 0) + 1;
            severityCounts[severity] = (severityCounts[severity] || 0) + 1;
        });

        return {
            total: totalResults,
            average: Math.round(totalResults / 30),
            dailyCounts: dailyCounts,
            monthlyCounts: monthlyCounts,
            severityCounts: severityCounts
        };
    }

    async function fetchVulnerabilityPage(startDate, endDate, startIndex, signal) {
        const query = new URLSearchParams({
            pubStartDate: startDate.toISOString(),
            pubEndDate: endDate.toISOString(),
            startIndex: String(startIndex),
            resultsPerPage: String(pageSize)
        });
        const response = await fetch(proxyUrl + "?" + query.toString(), { signal: signal });
        if (!response.ok) throw new Error("A consulta retornou status " + response.status + ".");
        const payload = await response.json();
        if (!Array.isArray(payload.vulnerabilities)) throw new Error("A fonte retornou dados em formato inesperado.");
        return payload;
    }

    function updateMetrics(data) {
        const values = {
            totalVulns: data.total,
            criticalCount: data.severityCounts.CRITICAL,
            highCount: data.severityCounts.HIGH,
            mediumCount: data.severityCounts.MEDIUM,
            lowCount: data.severityCounts.LOW,
            noneCount: data.severityCounts.NONE,
            avgDaily: data.average
        };

        Object.keys(values).forEach(function (key) {
            document.getElementById(key).textContent = formatNumber(values[key]);
        });
    }

    function clearCharts() {
        chartInstances.forEach(function (chart) {
            chart.destroy();
        });
        chartInstances = [];
    }

    function chartDefaults() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 600 },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: "#14263b",
                    borderColor: "rgba(140, 168, 196, .25)",
                    borderWidth: 1,
                    displayColors: false,
                    titleColor: "#ffffff",
                    bodyColor: "#dbe6f1",
                    padding: 12
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: "#8198ae", maxTicksLimit: 8 }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: "rgba(131, 158, 188, .13)" },
                    ticks: { color: "#8198ae", precision: 0 }
                }
            }
        };
    }

    function renderCharts(data, startDate, endDate) {
        clearCharts();

        const dailyLabels = [];
        const dailyValues = [];
        const cursor = new Date(startDate);
        while (cursor <= endDate) {
            const key = cursor.toISOString().slice(0, 10);
            dailyLabels.push(cursor.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }));
            dailyValues.push(data.dailyCounts[key] || 0);
            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }

        const dailyOptions = chartDefaults();
        chartInstances.push(new Chart(document.getElementById("dailyChart"), {
            type: "line",
            data: {
                labels: dailyLabels,
                datasets: [{
                    data: dailyValues,
                    borderColor: "#22d3ee",
                    backgroundColor: "rgba(34, 211, 238, .12)",
                    fill: true,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    tension: 0.36,
                    borderWidth: 2
                }]
            },
            options: dailyOptions
        }));

        const severityMap = [
            ["Crítica", data.severityCounts.CRITICAL, "#846cf9"],
            ["Alta", data.severityCounts.HIGH, "#ef5a69"],
            ["Média", data.severityCounts.MEDIUM, "#e9a23b"],
            ["Baixa", data.severityCounts.LOW, "#f4ce6d"],
            ["N/A", data.severityCounts.NONE, "#60758d"]
        ].filter(function (item) { return item[1] > 0; });

        chartInstances.push(new Chart(document.getElementById("severityChart"), {
            type: "doughnut",
            data: {
                labels: severityMap.map(function (item) { return item[0]; }),
                datasets: [{
                    data: severityMap.map(function (item) { return item[1]; }),
                    backgroundColor: severityMap.map(function (item) { return item[2]; }),
                    borderColor: "#0c1c2d",
                    borderWidth: 4,
                    hoverOffset: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: "70%",
                plugins: {
                    legend: {
                        display: true,
                        position: "bottom",
                        labels: { boxWidth: 9, boxHeight: 9, color: "#9eb3c7", padding: 15, usePointStyle: true }
                    },
                    tooltip: chartDefaults().plugins.tooltip
                }
            }
        }));

        const months = Object.keys(data.monthlyCounts).sort();
        const monthlyOptions = chartDefaults();
        chartInstances.push(new Chart(document.getElementById("monthlyChart"), {
            type: "bar",
            data: {
                labels: months.map(function (month) {
                    const parsed = new Date(month + "-01T00:00:00Z");
                    return parsed.toLocaleDateString("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" });
                }),
                datasets: [{
                    data: months.map(function (month) { return data.monthlyCounts[month]; }),
                    backgroundColor: "#3d63f2",
                    borderRadius: 7,
                    maxBarThickness: 70
                }]
            },
            options: monthlyOptions
        }));
    }

    async function loadThreatData() {
        if (activeRequest) activeRequest.abort();
        const controller = new AbortController();
        activeRequest = controller;
        const requestTimeout = window.setTimeout(function () {
            controller.abort();
        }, 90000);

        loading.hidden = false;
        errorPanel.hidden = true;
        dashboard.hidden = true;
        refreshButton.disabled = true;

        const endDate = new Date();
        const startDate = new Date(endDate);
        startDate.setUTCDate(startDate.getUTCDate() - 30);
        dateRange.textContent = startDate.toLocaleDateString("pt-BR") + " - " + endDate.toLocaleDateString("pt-BR");

        try {
            const firstPage = await fetchVulnerabilityPage(startDate, endDate, 0, controller.signal);
            const totalResults = Number(firstPage.totalResults) || firstPage.vulnerabilities.length;
            const vulnerabilities = firstPage.vulnerabilities.slice();
            const remainingOffsets = [];

            for (let offset = pageSize; offset < totalResults; offset += pageSize) {
                remainingOffsets.push(offset);
            }

            const additionalPages = await Promise.all(remainingOffsets.map(function (offset) {
                return fetchVulnerabilityPage(startDate, endDate, offset, controller.signal);
            }));
            additionalPages.forEach(function (page) {
                vulnerabilities.push.apply(vulnerabilities, page.vulnerabilities);
            });

            const analyzedVulnerabilities = vulnerabilities.slice(0, totalResults);
            const processed = processVulnerabilities(analyzedVulnerabilities, totalResults);
            updateMetrics(processed);
            renderCharts(processed, startDate, endDate);
            dateRange.textContent = startDate.toLocaleDateString("pt-BR") + " - " + endDate.toLocaleDateString("pt-BR") + " • " + formatNumber(totalResults) + " CVEs reportadas • " + formatNumber(analyzedVulnerabilities.length) + " registros analisados";
            dashboard.hidden = false;
        } catch (error) {
            if (activeRequest !== controller) return;
            const detail = error.name === "AbortError" ? "A consulta excedeu o tempo de resposta." : error.message;
            errorMessage.textContent = "Não foi possível consultar a NVD agora. " + detail;
            errorPanel.hidden = false;
        } finally {
            if (activeRequest === controller) {
                window.clearTimeout(requestTimeout);
                loading.hidden = true;
                refreshButton.disabled = false;
                activeRequest = null;
            }
        }
    }

    function requestInitialThreatData() {
        if (intelligenceRequested) return;
        intelligenceRequested = true;
        loadThreatData();
    }

    refreshButton.addEventListener("click", function () {
        intelligenceRequested = true;
        loadThreatData();
    });

    if ("IntersectionObserver" in window) {
        const intelligenceObserver = new IntersectionObserver(function (entries) {
            if (entries.some(function (entry) { return entry.isIntersecting; })) {
                intelligenceObserver.disconnect();
                requestInitialThreatData();
            }
        }, { rootMargin: "360px 0px" });
        intelligenceObserver.observe(intelligenceSection);
    } else {
        window.addEventListener("load", requestInitialThreatData);
    }
}());
