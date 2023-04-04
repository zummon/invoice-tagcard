import App from "./App.svelte";

let data = {
	"": {
		"font-link":
			"https://fonts.googleapis.com/css2?family=Kaushan+Script&display=swap",
		"font-style": "font-family: 'Kaushan Script', cursive;",
		label: {
			"": {
				title: "Invoice",
				ref: "No",
				date: "Date",
				duedate: "Due Date",
				client: "Bill to",
				paymethod: "Payment",
				itemNo: "No",
				itemDesc: "Description",
				itemPrice: "Price",
				itemQty: "Qty",
				itemAmount: "Amount",
				totalAmount: "Subtotal",
				totalVat: "Vat",
				totalWht: "Tax withheld",
				totalAdjust: "Adjust",
				totalFinal: "Pay Amount",
				note: "Note",
				vendorSign: "Vendor Signature",
				clientSign: "Client Signature"
			},
			quotation: {
				title: "Quotation",
				duedate: "Offer Until",
				client: "Offer to"
			},
			receipt: {
				title: "Receipt",
				client: "Received from",
				totalFinal: "Paid Amount",
				vendorSign: "Receiver Signature"
			},
			"tax-invoice": {
				title: "Tax Invoice"
			}
		},
		q: {
			lang: "",
			doc: "",
			currency: "$",
			vendorLogo: "",
			ref: Math.random().toString().slice(2, 8),
			date: new Date().toLocaleDateString(undefined),
			duedate: "...",
			vendorName: "Vendor Name",
			vendorId: "Register",
			vendorAddress: "Address",
			clientName: "Client Name",
			clientId: "Register",
			clientAddress: "Address",
			paymethod: "...",
			itemDesc: ["", "", "", "", ""],
			itemPrice: ["", "", "", "", ""],
			itemQty: ["", "", "", "", ""],
			vatRate: "0.05",
			whtRate: "0",
			totalAdjust: "",
			note: ""
		}
	},
	th: {
		"font-link":
			"https://fonts.googleapis.com/css2?family=Srisakdi:wght@700&display=swap",
		"font-style": "font-family: 'Srisakdi', cursive; font-weight: 700;",
		label: {
			"": {
				title: "ใบแจ้งหนี้",
				ref: "เลขที่",
				date: "วันที่",
				duedate: "ชำระภายใน",
				client: "ส่งถึง",
				paymethod: "วิธีชำระเงิน",
				itemNo: "#",
				itemDesc: "รายการ",
				itemPrice: "ราคา",
				itemQty: "จำนวน",
				itemAmount: "จำนวนเงิน",
				totalAmount: "รวม",
				totalVat: "ภาษีมูลค่าเพิ่ม",
				totalWht: "หัก ณ ที่จ่าย",
				totalAdjust: "ปรับปรุง",
				totalFinal: "ยอดชำระ",
				note: "หมายเหตุ",
				vendorSign: "ลายเซ็นผู้ขาย",
				clientSign: "ลายเซ็นผู้ซื้อ"
			},
			quotation: {
				title: "ใบเสนอราคา",
				duedate: "สั่งซื้อก่อนวันที่",
				client: "ส่งถึง"
			},
			receipt: {
				title: "ใบเสร็จรับเงิน",
				client: "รับเงินจาก",
				totalFinal: "ยอดชำระ",
				vendorSign: "ลายเซ็นผู้รับเงิน"
			},
			"tax-invoice": {
				title: "ใบกำกับภาษี"
			}
		},
		q: {
			lang: "th",
			doc: "",
			currency: "฿",
			vendorLogo: "",
			ref: Math.random().toString().slice(2, 8),
			date: new Date().toLocaleDateString("th"),
			duedate: "...",
			vendorName: "ชื่อผู้ขาย",
			vendorId: "เลขประจำตัว",
			vendorAddress: "ที่อยู่",
			clientName: "ชื่อลูกค้า",
			clientId: "เลขประจำตัว",
			clientAddress: "ที่อยู่",
			paymethod: "...",
			itemDesc: ["", "", "", "", ""],
			itemPrice: ["", "", "", "", ""],
			itemQty: ["", "", "", "", ""],
			vatRate: "0.07",
			whtRate: "0",
			totalAdjust: "",
			note: ""
		}
	}
};

const app = new App({
	target: document.getElementById("_app"),
	props: { data }
});

export default app;
