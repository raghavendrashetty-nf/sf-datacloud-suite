"use client";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
export async function exportElementToPDF(elementId: string, filename: string) {
  const el = document.getElementById(elementId);
  if (!el) throw new Error("Element #" + elementId + " not found");
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgW = pageW - 40;
  const imgH = (canvas.height * imgW) / canvas.width;
  let heightLeft = imgH;
  let position = 20;
  pdf.addImage(imgData, "PNG", 20, position, imgW, imgH);
  heightLeft -= (pageH - 40);
  while (heightLeft > 0) {
    position = 20 - (imgH - heightLeft);
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 20, position, imgW, imgH);
    heightLeft -= (pageH - 40);
  }
  pdf.save(filename);
}
