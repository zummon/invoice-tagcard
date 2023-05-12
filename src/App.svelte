<script>
	import { onMount } from "svelte";

	export let data;

	let l = data[""].label[""];
	let q = data[""].q;

	const price = number => {
	  number = Number(number);
	  if (number === 0 || isNaN(number)) {
	    return "";
	  }
	  return `${q.currency} ${number.toLocaleString(undefined, {
	    minimumFractionDigits: 2,
	  })}`;
	};
	const qty = number => {
	  number = Number(number);
	  if (number === 0 || isNaN(number)) {
	    return "";
	  }
	  return number.toLocaleString(undefined, {
	    minimumFractionDigits: 0,
	  });
	};
	const rate = rate => {
	  rate = Number(rate) * 100;
	  if (!Number.isInteger(rate)) {
	    rate = rate.toFixed(2);
	  }
	  return `${rate} %`;
	};
	const addItem = () => {
	  q.itemDesc.push("");
	  q.itemPrice.push("");
	  q.itemQty.push("");
	  q = q;
	};
	const removeItem = () => {
	  q.itemDesc.pop();
	  q.itemPrice.pop();
	  q.itemQty.pop();
	  q = q;
	};

	onMount(() => {
	  const s = new URLSearchParams(location.search);
	  let obj = q;
	  Object.keys(q).forEach(key => {
	    const values = s.getAll(key);
	    if (values.length > 0) {
	      if (Array.isArray(q[key])) {
	        obj[key] = values;
	        return;
	      }
	      obj[key] = values[0];
	    }
	  });
	  q = { ...data[q.lang].q, ...obj };
	});

	$: {
	  document.body.style = data[q.lang]["font-style"];
	}
	
	$: l = {
	  ...data[q.lang].label[""],
	  ...data[q.lang].label[q.doc]
	};
	$: q.itemAmount = q.itemPrice.map((pr, i) => {
	  const num = Number(pr) * Number(q.itemQty[i]);
	  return num ? num : "";
	});
	$: q.totalAmount = q.itemAmount.reduce((a, b) => {
	  const num = Number(a) + Number(b);
	  return num ? num : "";
	}, 0);
	$: q.totalVat = Number(q.totalAmount) * Number(q.vatRate);
	$: q.totalWht = Number(q.totalAmount) * Number(q.whtRate);
	$: q.totalFinal =
	  Number(q.totalAmount) +
	  Number(q.totalVat) +
	  Number(q.totalWht) +
	  Number(q.totalAdjust);
</script>

<svelte:head>
	<link href={data[q.lang]['font-link']} rel="stylesheet"/>
</svelte:head>

<div class="flex flex-wrap justify-center items-center my-4 print:hidden">
	{#each Object.keys(data) as lng, i (`lang-${i}`)}
		<button class="p-3 shadow-md {q.lang === lng ? "bg-gray-900 text-white" : "text-gray-900 bg-gray-50 hover:bg-gray-900 focus:bg-gray-900 hover:text-white focus:text-white"}" on:click={() => {
			q.lang = lng
		}}>
			{data[lng]['']}
		</button>
	{/each}
	{#each Object.keys(data[q.lang].label) as dc, i (`doc-${i}`)}
		<button class="p-3 shadow-md {q.doc === dc ? "bg-gray-900 text-white" : "text-gray-900 bg-gray-50 hover:bg-gray-900 focus:bg-gray-900 hover:text-white focus:text-white"}" on:click={() => {
			q.doc = dc
		}}>
			{data[q.lang].label[dc].title}
		</button>
	{/each}
</div>

<div class="bg-white text-gray-900 px-3 max-w-[60rem] mx-auto print:max-w-none print:mx-0" >
	<div class="bg-gray-50 flex p-4 shadow-md">
		<div class="pr-4">
			<img class="" src={q.vendorLogo} alt="" width="" height="">
		</div>
		<div class="flex-1 text-right">
			<h2 class="border-b text-xl" contenteditable="true" bind:textContent={q.vendorName}></h2>
			<p class="" contenteditable="true" bind:textContent={q.vendorId}></p>
			<p class="" contenteditable="true" bind:textContent={q.vendorAddress}></p>
		</div>
	</div>
	<div class="grid grid-cols-2 my-4">
		<div class="">
			<h1 class="text-3xl">{l.title}</h1>
			<p class="mt-2 mb-4">
				<span class="inline-block rounded-3xl bg-gray-900 text-white py-0.5 px-2 text-sm" contenteditable="true" bind:textContent={q.ref}></span>
				<span class="inline-block rounded-3xl bg-gray-900 text-white py-0.5 px-2 text-sm" contenteditable="true" bind:textContent={q.date}></span>
			</p>
			<span class="inline-block rounded-3xl bg-gray-900 text-white py-0.5 px-2 text-sm">{l.client}</span>
			<h2 class="text-xl pl-3 mt-2" contenteditable="true" bind:textContent={q.clientName}></h2>
			<p class="pl-3" contenteditable="true" bind:textContent={q.clientId}></p>
			<p class="pl-3" contenteditable="true" bind:textContent={q.clientAddress}></p>
		</div>
		<div class="">
			{#if q.doc !== 'receipt'}
				<span class="inline-block rounded-3xl bg-gray-900 text-white py-0.5 px-2 text-sm">{l.duedate}</span>
				<p class="pl-3 mt-2 mb-4" contenteditable="true" bind:textContent={q.duedate}></p>
			{/if}
			<span class="inline-block rounded-3xl bg-gray-900 text-white py-0.5 px-2 text-sm">{l.paymethod}</span>
			<p class="pl-3 mt-2 mb-4" contenteditable="true" bind:textContent={q.paymethod}></p>
			<div class="bg-gray-900 text-white text-right p-4 shadow-md">
				<h2 class="border-b border-gray-700 text-2xl">
					{price(q.totalFinal)}
				</h2>
				<p class="">{l.totalFinal}</p>
			</div>
		</div>
	</div>
	<table class="w-full mb-4">
		<thead class="">
			<tr class="border-b">
				<td class="p-1 w-px whitespace-nowrap">{l.itemNo}</td>
				<td class="">
					<div class="flex">
						<p class="p-1 flex-grow">{l.itemDesc}</p>
						<button class="p-1.5 print:hidden" on:click={addItem}>
							<!-- heroicons solid duplicate -->
							<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
								<path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" />
								<path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z" />
							</svg>
						</button>
						<button class="p-1.5 print:hidden" on:click={removeItem}>
							<!-- heroicons solid trash -->
							<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
								<path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
							</svg>
						</button>
					</div>
				</td>
				<td class="p-1 w-px whitespace-nowrap">{l.itemPrice}</td>
				<td class="p-1 w-px whitespace-nowrap">{l.itemQty}</td>
				<td class="p-1 w-px whitespace-nowrap">{l.itemAmount}</td>
			</tr>
		</thead>
		<tbody class="divide-y">
			{#each q.itemDesc as _, i (`item-${i}`)}
				<tr class="odd:bg-gray-50">
					<td class="p-1 text-center whitespace-nowrap" contenteditable="true">{i + 1}</td>
					<td class="p-1" contenteditable="true" bind:textContent={q.itemDesc[i]}></td>
					<td class="p-1 text-right whitespace-nowrap" contenteditable="true" 
						on:focus={(e) => e.target.textContent = q.itemPrice[i]}
						on:input={(e) => q.itemPrice[i] = e.target.textContent}
						on:blur={(e) => e.target.textContent = price(q.itemPrice[i])}
					>
						{price(q.itemPrice[i])}
					</td>
					<td class="p-1 text-right whitespace-nowrap" contenteditable="true" 
						on:focus={(e) => e.target.textContent = q.itemQty[i]}
						on:input={(e) => q.itemQty[i] = e.target.textContent}
						on:blur={(e) => e.target.textContent = qty(q.itemQty[i])}
					>
						{qty(q.itemQty[i])}
					</td>
					<td class="p-1 text-right whitespace-nowrap">
						{price(q.itemAmount[i])}
					</td>
				</tr>
			{/each}
		</tbody>
		<tfoot class="text-right">
			<tr class="">
				<td class="text-left p-1" colspan="2" rowspan={q.doc === 'receipt' ? 4 : 3}>
					<span class="inline-block rounded-3xl bg-gray-900 text-white py-0.5 px-2 text-sm">{l.note}</span>
					<p class="pl-3 mt-2 mb-4" contenteditable="true" bind:textContent={q.note}></p>
				</td>
				<td class="p-1 whitespace-nowrap" colspan="2">{l.totalAmount}</td>
				<td class="p-1 whitespace-nowrap">
					{price(q.totalAmount)}
				</td>
			</tr>
			<tr class="">
				<td class="p-1 whitespace-nowrap" colspan="2">
					<span class="inline-block">{l.totalVat}</span>
					<span class=""> </span>
					<span class="inline-block rounded-3xl bg-gray-900 text-white py-0.5 px-2 text-sm">
						<span class="" contenteditable="true" 
							on:focus={(e) => e.target.textContent = q.vatRate}
							on:input={(e) => q.vatRate = e.target.textContent}
							on:blur={(e) => e.target.textContent = rate(q.vatRate)}
						>
							{rate(q.vatRate)}
						</span>
					</span>
				</td>
				<td class="p-1 whitespace-nowrap">
					{price(q.totalVat)}
				</td>
			</tr>
			{#if q.doc === 'receipt'}
				<tr class="">
					<td class="p-1 whitespace-nowrap" colspan="2">
						<span class="inline-block">{l.totalWht}</span>
						<span class=""> </span>
						<span class="inline-block rounded-3xl bg-gray-900 text-white py-0.5 px-2 text-sm">
							<span class="" contenteditable="true" 
								on:focus={(e) => e.target.textContent = q.whtRate}
								on:input={(e) => q.whtRate = e.target.textContent}
								on:blur={(e) => e.target.textContent = rate(q.whtRate)}
							>
								{rate(q.whtRate)}
							</span>
						</span>
					</td>
					<td class="p-1 whitespace-nowrap">
						{price(q.totalWht)}
					</td>
				</tr>
			{/if}
			<tr class="">
				<td class="p-1 whitespace-nowrap" colspan="2">{l.totalAdjust}</td>
				<td class="p-1 whitespace-nowrap" contenteditable="true" 
					on:focus={(e) => e.target.textContent = q.totalAdjust}
					on:input={(e) => q.totalAdjust = e.target.textContent}
					on:blur={(e) => e.target.textContent = price(q.totalAdjust)}
				>
					{price(q.totalAdjust)}
				</td>
			</tr>
		</tfoot>
	</table>
	<div class="grid grid-cols-2 gap-4">
		<div class="bg-gray-50 p-4 shadow-md">
			<h3 class="">{l.vendorSign}</h3>
			<p class="border-b" contenteditable="true"></p>
			<p class="" contenteditable="true"></p>
		</div>
		<div class="bg-gray-50 p-4 shadow-md">
			<h3 class="">{l.clientSign}</h3>
			<p class="border-b" contenteditable="true"></p>
			<p class="" contenteditable="true"></p>
		</div>
	</div>
</div>

<div class="flex flex-wrap justify-center items-center my-4 print:hidden">
	<button class="p-3 shadow-md text-white bg-gray-900" on:click={() => window.print()}>
		Print
	</button>
</div>